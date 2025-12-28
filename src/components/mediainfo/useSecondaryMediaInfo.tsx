// 导入日期时间处理脚本
import datetime from 'scripts/datetime';
// 导入应用路由器
import { appRouter } from 'components/router/appRouter';
// 导入类型定义
import type { NullableString } from 'types/base/common/shared/types';
import type { ItemDto } from 'types/base/models/item-dto';
import type { MiscInfo } from 'types/mediaInfoItem';
import { ItemKind } from 'types/base/models/item-kind';
import type { SecondaryInfoOpts } from './type';

/**
 * 添加节目时间信息
 * @param showProgramTimeInfo - 是否显示节目时间信息
 * @param showStartDateInfo - 是否显示开始日期信息
 * @param showEndDateInfo - 是否显示结束日期信息
 * @param itemStartDate - 项目开始日期
 * @param itemEndDate - 项目结束日期
 * @param addMiscInfo - 添加额外信息的回调函数
 */
function addProgramTime(
    showProgramTimeInfo: boolean,
    showStartDateInfo: boolean,
    showEndDateInfo: boolean,
    itemStartDate: NullableString,
    itemEndDate: NullableString,
    addMiscInfo: (val: MiscInfo) => void
): void {
    // 初始化节目时间文本
    let programTimeText = '';
    let date;

    // 如果需要显示节目时间信息且开始日期存在
    if (showProgramTimeInfo && itemStartDate) {
        try {
            // 解析ISO8601格式的日期
            date = datetime.parseISO8601Date(itemStartDate);

            // 如果需要显示开始日期，添加日期格式（周几、月份、日期）
            if (showStartDateInfo) {
                programTimeText += datetime.toLocaleDateString(date, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                });
            }

            // 添加时间信息
            programTimeText += ` ${datetime.getDisplayTime(date)}`;

            // 如果需要显示结束日期且结束日期存在
            if (showEndDateInfo && itemEndDate) {
                date = datetime.parseISO8601Date(itemEndDate);
                programTimeText += ` - ${datetime.getDisplayTime(date)}`;
            }
            // 添加节目时间文本到附加信息
            addMiscInfo({ text: programTimeText });
        } catch {
            // 日期解析失败时记录错误
            console.error('error parsing date:', itemStartDate);
        }
    }
}

/**
 * 添加频道号信息
 * @param showChannelNumberInfo - 是否显示频道号信息
 * @param itemChannelNumber - 项目频道号
 * @param addMiscInfo - 添加额外信息的回调函数
 */
function addChannelNumber(
    showChannelNumberInfo: boolean,
    itemChannelNumber: NullableString,
    addMiscInfo: (val: MiscInfo) => void
): void {
    // 如果需要显示频道号且频道号存在
    if (showChannelNumberInfo && itemChannelNumber) {
        addMiscInfo({
            text: `CH ${itemChannelNumber}`
        });
    }
}

/**
 * 添加频道名称信息
 * @param showChannelInfo - 是否显示频道信息
 * @param channelInteractive - 频道是否可交互（可点击）
 * @param item - 项目数据对象
 * @param addMiscInfo - 添加额外信息的回调函数
 */
const addChannelName = (
    showChannelInfo: boolean,
    channelInteractive: boolean,
    item: ItemDto,
    addMiscInfo: (val: MiscInfo) => void
) => {
    // 如果需要显示频道信息且频道名称存在
    if (showChannelInfo && item.ChannelName) {
        // 如果频道可交互且频道ID存在，创建可点击的链接
        if (channelInteractive && item.ChannelId) {
            // 获取频道路由URL
            const url = appRouter.getRouteUrl({
                ServerId: item.ServerId,
                Type: ItemKind.TvChannel,
                Name: item.ChannelName,
                Id: item.ChannelId
            });

            // 添加带有操作的文本信息（可点击跳转）
            addMiscInfo({
                textAction: {
                    url,
                    title: item.ChannelName
                }
            });
        } else {
            // 否则只显示频道名称文本
            addMiscInfo({ text: item.ChannelName });
        }
    }
};

// 定义钩子属性接口，继承自SecondaryInfoOpts
interface UseSecondaryMediaInfoProps extends SecondaryInfoOpts {
    item: ItemDto; // 项目数据对象
}

/**
 * 次要媒体信息钩子
 * 用于处理和返回节目、频道等次要媒体信息
 * @param item - 项目数据对象
 * @param showProgramTimeInfo - 是否显示节目时间信息，默认false
 * @param showStartDateInfo - 是否显示开始日期信息，默认false
 * @param showEndDateInfo - 是否显示结束日期信息，默认false
 * @param showChannelNumberInfo - 是否显示频道号信息，默认false
 * @param showChannelInfo - 是否显示频道信息，默认false
 * @param channelInteractive - 频道是否可交互，默认false
 * @returns 返回包含各种次要信息的数组
 */
function useSecondaryMediaInfo({
    item,
    showProgramTimeInfo = false,
    showStartDateInfo = false,
    showEndDateInfo = false,
    showChannelNumberInfo = false,
    showChannelInfo = false,
    channelInteractive = false
}: UseSecondaryMediaInfoProps) {
    // 从项目对象中解构出结束日期、开始日期和频道号
    const { EndDate, StartDate, ChannelNumber } = item;

    // 初始化附加信息数组
    const miscInfo: MiscInfo[] = [];

    // 仅处理类型为节目的项目
    if (item.Type === ItemKind.Program) {
        // 定义添加附加信息的回调函数
        const addMiscInfo = (val: MiscInfo) => {
            if (val) {
                miscInfo.push(val);
            }
        };

        // 添加节目时间信息
        addProgramTime(
            showProgramTimeInfo,
            showStartDateInfo,
            showEndDateInfo,
            StartDate,
            EndDate,
            addMiscInfo
        );

        // 添加频道号信息
        addChannelNumber(showChannelNumberInfo, ChannelNumber, addMiscInfo);

        // 添加频道名称信息
        addChannelName(showChannelInfo, channelInteractive, item, addMiscInfo);
    }
    // 返回附加信息数组
    return miscInfo;
}

export default useSecondaryMediaInfo;

