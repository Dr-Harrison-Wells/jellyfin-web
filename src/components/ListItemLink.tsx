// 导入 Material-UI 的 ListItemButton 组件及其基础属性类型
import ListItemButton, { ListItemButtonBaseProps } from '@mui/material/ListItemButton';
// 导入 React 核心库和 FC（函数组件）类型
import React, { FC } from 'react';
// 导入 React Router 的导航相关 hooks
import { Link, useLocation, useSearchParams } from 'react-router-dom';

/**
 * ListItemLink 组件的属性接口
 * 继承自 Material-UI ListItemButton 的基础属性
 */
interface ListItemLinkProps extends ListItemButtonBaseProps {
    /** 目标路由路径 */
    to: string
    /** 额外的匹配路径列表，用于判断当前项是否被选中 */
    includePaths?: string[]
    /** 排除的路径列表，即使匹配也不显示为选中状态 */
    excludePaths?: string[]
}

/**
 * 判断路由参数是否匹配
 * @param routeParams - 目标路由的 URL 参数
 * @param currentParams - 当前页面的 URL 参数
 * @returns 如果所有目标参数都与当前参数匹配则返回 true，否则返回 false
 */
const isMatchingParams = (routeParams: URLSearchParams, currentParams: URLSearchParams) => {
    // 遍历目标路由的所有参数
    for (const param of routeParams) {
        // 如果任何参数不匹配，则返回 false
        if (currentParams.get(param[0]) !== param[1]) {
            return false;
        }
    }

    // 所有参数都匹配
    return true;
};

/**
 * 带有链接功能的列表项组件
 * 用于在侧边栏或菜单中创建可导航的列表项，支持选中状态的自动判断
 */
const ListItemLink: FC<ListItemLinkProps> = ({
    children,
    to,
    includePaths = [],
    excludePaths = [],
    ...params
}) => {
    // 获取当前路由位置信息
    const location = useLocation();
    // 获取当前 URL 的查询参数
    const [ searchParams ] = useSearchParams();

    // 将目标路径分解为路径和查询参数两部分
    const [ toPath, toParams ] = to.split('?');
    // 将目标查询参数字符串转换为 URLSearchParams 对象
    // eslint-disable-next-line compat/compat
    const toSearchParams = new URLSearchParams(`?${toParams}`);
    // 构建所有可能匹配的路径列表（包含目标路径和额外的包含路径）
    const selectedPaths = [ toPath, ...includePaths ];

    // 判断当前项是否应该显示为选中状态
    // 条件：1. 当前路径在选中路径列表中
    //       2. 当前完整路径（路径+查询参数）不在排除列表中
    //       3. 如果目标有查询参数，则需要参数也匹配
    const selected = selectedPaths.includes(location.pathname)
        && !excludePaths.includes(location.pathname + location.search)
        && (!toParams || isMatchingParams(toSearchParams, searchParams));

    return (
        <ListItemButton
            component={Link}
            to={to}
            selected={selected}
            {...params}
        >
            {children}
        </ListItemButton>
    );
};

export default ListItemLink;
