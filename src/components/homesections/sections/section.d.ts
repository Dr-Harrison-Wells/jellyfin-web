import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type { BaseItemDtoQueryResult } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto-query-result';

/**
 * HomeSection（首页分区/模块）渲染相关的配置项。
 */
export interface SectionOptions {
    /**
     * 是否允许内容溢出（例如横向滚动区域是否可超出容器边界）。
     */
    enableOverflow: boolean
}

/**
 * Section 容器元素的约定接口：既是一个 DOM `Element`，又额外挂载了数据获取与渲染能力。
 */
export type SectionContainerElement = {
    /**
     * 拉取该 section 所需的数据。
     * 返回值可能是分页查询结果（`BaseItemDtoQueryResult`）或已展开的条目数组（`BaseItemDto[]`）。
     */
    fetchData: () => Promise<BaseItemDtoQueryResult | BaseItemDto[]>

    /**
     * 将条目列表渲染到页面。
     * 注意：此处仅声明签名，具体实现由对应的 section 组件提供。
     */
    getItemsHtml: (items: BaseItemDto[]) => void

    /**
     * section 所属的父级容器元素（用于挂载/定位布局）。
     */
    parentContainer: HTMLElement
} & Element;
