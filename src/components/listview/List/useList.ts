// 导入依赖
import classNames from 'classnames';
import { getDataAttributes } from 'utils/items';
import layoutManager from 'components/layoutManager';

// 导入类型定义
import type { ItemDto } from 'types/base/models/item-dto';
import type { ListOptions } from 'types/listOptions';

/**
 * useList Hook 的属性接口
 */
interface UseListProps {
    item: ItemDto; // 列表项数据
    listOptions: ListOptions; // 列表配置选项
}

/**
 * 列表项 Hook - 用于管理列表项的显示逻辑和属性
 * @param item - 媒体项数据对象
 * @param listOptions - 列表显示配置选项
 * @returns 包含列表包装器和内容属性的获取函数
 */
function useList({ item, listOptions }: UseListProps) {
    // 列表项的操作类型，默认为 'link'（链接）
    const action = listOptions.action ?? 'link';
    // 是否使用大图样式
    const isLargeStyle = listOptions.imageSize === 'large';
    // 是否启用概览信息显示
    const enableOverview = listOptions.enableOverview;
    // 是否整个项目都可点击（TV 模式下为 true）
    const clickEntireItem = !!layoutManager.tv;
    // 是否启用侧边媒体信息显示，默认为 true
    const enableSideMediaInfo = listOptions.enableSideMediaInfo ?? true;
    // 是否启用内容包装器（仅在非 TV 模式且启用概览时）
    const enableContentWrapper =
        listOptions.enableOverview && !layoutManager.tv;
    // 下载图片的宽度（大图为 500px，小图为 80px）
    const downloadWidth = isLargeStyle ? 500 : 80;

    // 获取数据属性对象，包含项目的各种元数据
    const dataAttributes = getDataAttributes(
        {
            action, // 操作类型
            itemServerId: item.ServerId, // 服务器 ID
            itemId: item.Id, // 项目 ID
            collectionId: listOptions.collectionId, // 集合 ID
            playlistId: listOptions.playlistId, // 播放列表 ID
            itemChannelId: item.ChannelId, // 频道 ID
            itemType: item.Type, // 项目类型
            itemMediaType: item.MediaType, // 媒体类型
            itemCollectionType: item.CollectionType, // 集合类型
            itemIsFolder: item.IsFolder, // 是否为文件夹
            itemPlaylistItemId: item.PlaylistItemId // 播放列表项 ID
        }
    );

    // 构建列表包装器的 CSS 类名
    const listWrapperClass = classNames(
        'listItem', // 基础列表项类名
        {
            'listItem-border': // 显示边框
                listOptions.border
                ?? (listOptions.highlight !== false && !layoutManager.tv)
        },
        { 'itemAction listItem-button': clickEntireItem }, // 整个项目可点击时添加按钮样式
        { 'listItem-focusscale': layoutManager.tv }, // TV 模式下的焦点缩放效果
        { 'listItem-largeImage': isLargeStyle }, // 大图样式
        { 'listItem-withContentWrapper': enableContentWrapper } // 启用内容包装器样式
    );

    /**
     * 获取列表包装器的属性
     * @returns 包含类名、标题、操作类型和数据属性的对象
     */
    const getListdWrapperProps = () => ({
        className: listWrapperClass, // CSS 类名
        title: item.Name, // 鼠标悬停提示文本（项目名称）
        action, // 操作类型
        dataAttributes // 数据属性
    });

    /**
     * 获取列表内容的属性
     * @returns 包含列表内容所需的所有配置属性
     */
    const getListContentProps = () => ({
        item, // 项目数据
        listOptions, // 列表选项
        enableContentWrapper, // 是否启用内容包装器
        enableOverview, // 是否启用概览
        enableSideMediaInfo, // 是否启用侧边媒体信息
        clickEntireItem, // 是否整个项目可点击
        action, // 操作类型
        isLargeStyle, // 是否大图样式
        downloadWidth // 下载图片宽度
    });

    // 返回获取属性的函数
    return {
        getListdWrapperProps,
        getListContentProps
    };
}

export default useList;
