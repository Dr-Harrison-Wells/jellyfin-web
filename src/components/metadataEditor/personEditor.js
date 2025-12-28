import { PersonKind } from '@jellyfin/sdk/lib/generated-client/models/person-kind';

import dialogHelper from '../dialogHelper/dialogHelper';
import layoutManager from '../layoutManager';
import globalize from '../../lib/globalize';
import '../../elements/emby-button/paper-icon-button-light';
import '../../elements/emby-input/emby-input';
import '../../elements/emby-select/emby-select';
import '../formdialog.scss';
import template from './personEditor.template.html';

// 电视端（TV 布局）下：将焦点元素滚动/居中到视口，提升遥控器/方向键操作体验。
function centerFocus(elem, horiz, on) {
    import('../../scripts/scrollHelper').then((scrollHelper) => {
        const fn = on ? 'on' : 'off';
        scrollHelper.centerFocus[fn](elem, horiz);
    });
}

// 打开“人物编辑”对话框，用户提交后 resolve 更新后的 person；取消/关闭则 reject。
// 注意：这里不做任何输入校验（按需求“不要校验”），直接把表单值写回 person。
function show(person) {
    return new Promise((resolve, reject) => {
        const dialogOptions = {
            removeOnClose: true,
            scrollY: false
        };

        if (layoutManager.tv) {
            dialogOptions.size = 'fullscreen';
        } else {
            dialogOptions.size = 'small';
        }

        const dlg = dialogHelper.createDialog(dialogOptions);

        dlg.classList.add('formDialog');

        let html = '';
        let submitted = false;

        html += globalize.translateHtml(template, 'core');

        dlg.innerHTML = html;

        // 初始化表单：从 person 对象回填到输入框/下拉框。
        dlg.querySelector('.txtPersonName', dlg).value = person.Name || '';
        dlg.querySelector('.selectPersonType', dlg).value = person.Type || '';
        dlg.querySelector('.txtPersonRole', dlg).value = person.Role || '';

        if (layoutManager.tv) {
            centerFocus(dlg.querySelector('.formDialogContent'), false, true);
        }

        dialogHelper.open(dlg);

        dlg.addEventListener('close', () => {
            if (layoutManager.tv) {
                centerFocus(dlg.querySelector('.formDialogContent'), false, false);
            }

            // 通过 submitted 区分“提交保存”与“直接关闭/取消”。
            if (submitted) {
                resolve(person);
            } else {
                reject();
            }
        });

        // 生成“人物类型”下拉选项：跳过 Unknown，并对当前 person.Type 做选中。
        let selectPersonTypeOptions = '<option value=""></option>';
        for (const type of Object.values(PersonKind)) {
            if (type === PersonKind.Unknown) {
                continue;
            }
            const selected = person.Type === type ? 'selected' : '';
            selectPersonTypeOptions += `<option value="${type}" ${selected}>\${${type}}</option>`;
        }
        dlg.querySelector('.selectPersonType').innerHTML = globalize.translateHtml(selectPersonTypeOptions);

        dlg.querySelector('.selectPersonType').addEventListener('change', function () {
            // 仅当类型是 Actor/GuestStar 时才显示“角色(Role)”输入。
            dlg.querySelector('.fldRole').classList.toggle(
                'hide',
                ![ PersonKind.Actor, PersonKind.GuestStar ].includes(this.value));
        });

        dlg.querySelector('.btnCancel').addEventListener('click', () => {
            // 取消：关闭对话框，close 事件中会走 reject。
            dialogHelper.close(dlg);
        });

        dlg.querySelector('form').addEventListener('submit', (e) => {
            submitted = true;

            // 保存：把表单值直接写回传入的 person 对象。
            person.Name = dlg.querySelector('.txtPersonName', dlg).value;
            person.Type = dlg.querySelector('.selectPersonType', dlg).value;
            // 角色允许为空；空字符串统一转成 null。
            person.Role = dlg.querySelector('.txtPersonRole', dlg).value || null;

            dialogHelper.close(dlg);

            e.preventDefault();
            return false;
        });

        dlg.querySelector('.selectPersonType').dispatchEvent(new CustomEvent('change', {
            bubbles: true
        }));
    });
}

export default {
    show: show
};

