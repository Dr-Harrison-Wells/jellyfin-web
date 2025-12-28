/* eslint-disable no-restricted-globals */
/**
 * Blurhash Worker
 * 用于在 Web Worker 中解码 Blurhash 图像占位符
 * Blurhash 是一种将图像编码为短字符串的算法，可以作为加载时的占位符显示
 */
import { decode } from 'blurhash';

/**
 * 监听来自主线程的消息
 * 接收 blurhash 字符串和目标尺寸，解码后返回像素数据
 */
self.onmessage = ({ data: { hash, width, height } }): void => {
    try {
        // 解码 blurhash 字符串并发送像素数据回主线程
        self.postMessage({
            pixels: decode(hash, width, height), // 解码后的像素数组
            hsh: hash, // 原始 hash 值
            width: width, // 图像宽度
            height: height // 图像高度
        });
    } catch {
        // 如果 blurhash 字符串无效，抛出类型错误
        throw new TypeError(`Blurhash ${hash} is not valid`);
    }
};
/* eslint-enable no-restricted-globals */
