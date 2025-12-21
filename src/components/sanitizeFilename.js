// TODO: Check if needed and move to external dependency
// From https://github.com/parshap/node-sanitize-filename

/**
 * 文件名清理工具
 * 用于移除或替换文件名中的非法字符，确保文件名在不同操作系统中都能正常使用
 */

// 非法字符正则表达式：匹配文件系统中不允许使用的字符 /? < > \ : * | "
// eslint-disable-next-line sonarjs/duplicates-in-character-class
const illegalRe = /[/?<>\\:*|":]/g;
// 控制字符正则表达式：匹配ASCII控制字符（0x00-0x1f）和扩展ASCII控制字符（0x80-0x9f）
// eslint-disable-next-line no-control-regex, sonarjs/no-control-regex
const controlRe = /[\x00-\x1f\x80-\x9f]/g;
// 保留字符正则表达式：匹配只包含点号的文件名（如 "." 或 ".."）
const reservedRe = /^\.+$/;
// Windows保留文件名正则表达式：匹配Windows系统中的保留设备名
// CON, PRN, AUX, NUL, COM1-COM9, LPT1-LPT9
// eslint-disable-next-line sonarjs/concise-regex
const windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
// Windows尾随字符正则表达式：匹配文件名末尾的点号和空格（Windows不允许）
// eslint-disable-next-line sonarjs/slow-regex
const windowsTrailingRe = /[. ]+$/;

/**
 * 检查是否为高位代理（UTF-16编码）
 * @param {number} codePoint - Unicode码点
 * @returns {boolean} 如果是高位代理则返回true
 */
function isHighSurrogate(codePoint) {
    return codePoint >= 0xd800 && codePoint <= 0xdbff;
}

/**
 * 检查是否为低位代理（UTF-16编码）
 * @param {number} codePoint - Unicode码点
 * @returns {boolean} 如果是低位代理则返回true
 */
function isLowSurrogate(codePoint) {
    return codePoint >= 0xdc00 && codePoint <= 0xdfff;
}

/**
 * 获取字符串的字节长度（UTF-8编码）
 * @param {string} string - 输入字符串
 * @returns {number} 字节长度
 * @throws {Error} 如果输入不是字符串
 */
function getByteLength(string) {
    if (typeof string !== 'string') {
        throw new Error('Input must be string');
    }

    const charLength = string.length;
    let byteLength = 0;
    let codePoint = null;
    let prevCodePoint = null;
    for (let i = 0; i < charLength; i++) {
        codePoint = string.charCodeAt(i);
        // 处理4字节的非BMP（基本多文种平面）字符
        // 低位代理
        if (isLowSurrogate(codePoint)) {
            // 当解析前一个高位代理时，已经向byteLength添加了3
            if (prevCodePoint != null && isHighSurrogate(prevCodePoint)) {
                byteLength += 1;
            } else {
                byteLength += 3;
            }
        } else if (codePoint <= 0x7f) {
            // ASCII字符：1字节
            byteLength += 1;
        } else if (codePoint >= 0x80 && codePoint <= 0x7ff) {
            // 拉丁文扩展等：2字节
            byteLength += 2;
        } else if (codePoint >= 0x800 && codePoint <= 0xffff) {
            // 中日韩字符等：3字节
            byteLength += 3;
        }
        prevCodePoint = codePoint;
    }

    return byteLength;
}

/**
 * 截断字符串到指定的字节长度
 * @param {string} string - 输入字符串
 * @param {number} byteLength - 目标字节长度
 * @returns {string} 截断后的字符串
 * @throws {Error} 如果输入不是字符串
 */
function truncate(string, byteLength) {
    if (typeof string !== 'string') {
        throw new Error('Input must be string');
    }

    const charLength = string.length;
    let curByteLength = 0;
    let codePoint;
    let segment;

    for (let i = 0; i < charLength; i += 1) {
        codePoint = string.charCodeAt(i);
        segment = string[i];

        // 检查是否为代理对（4字节字符）
        if (isHighSurrogate(codePoint) && isLowSurrogate(string.charCodeAt(i + 1))) {
            // eslint-disable-next-line sonarjs/updated-loop-counter
            i += 1;
            segment += string[i];
        }

        curByteLength += getByteLength(segment);

        // 刚好达到目标字节长度
        if (curByteLength === byteLength) {
            return string.slice(0, i + 1);
        } else if (curByteLength > byteLength) {
            // 超过目标字节长度，返回不包含当前段的字符串
            return string.slice(0, i - segment.length + 1);
        }
    }

    return string;
}

/**
 * 清理文件名，移除非法字符并截断到255字节
 * @param {string} input - 原始文件名
 * @param {string} replacement - 用于替换非法字符的字符串
 * @returns {string} 清理后的文件名
 */
export function sanitize(input, replacement) {
    const sanitized = input
        .replace(illegalRe, replacement) // 替换非法字符
        .replace(controlRe, replacement) // 替换控制字符
        .replace(reservedRe, replacement) // 替换保留字符
        .replace(windowsReservedRe, replacement) // 替换Windows保留文件名
        .replace(windowsTrailingRe, replacement); // 替换Windows尾随字符
    // 截断到255字节（大多数文件系统的文件名长度限制）
    return truncate(sanitized, 255);
}
