// Fetch 选项接口
interface FetchOptions {
    // 缓存控制选项
    cache?: string
}

// URL 解析器，用于将相对 URL 转换为绝对 URL
const URL_RESOLVER = document.createElement('a');

/**
 * 支持 `file:` 协议的 `fetch` 函数
 * 近期浏览器在某些条件下似乎支持 `file` 协议。
 * 基于: https://github.com/github/fetch/pull/92#issuecomment-174730593
 *      https://github.com/github/fetch/pull/92#issuecomment-512187452
 *
 * @param url - 要获取的资源 URL
 * @param options - 可选的 Fetch 选项
 * @returns 返回一个 Promise，解析为 Response 对象
 */
export default async function fetchLocal(url: string, options?: FetchOptions) {
    // 使用 a 标签的 href 属性来解析 URL
    URL_RESOLVER.href = url;

    // 获取解析后的绝对 URL
    const requestURL = URL_RESOLVER.href;

    // 创建并返回 Promise 来处理异步请求
    return new Promise<Response>((resolve, reject) => {
        // 创建 XMLHttpRequest 对象
        const xhr = new XMLHttpRequest;

        // 设置加载完成的回调函数
        xhr.onload = () => {
            // `file` 协议返回的状态码无效，需要特殊处理
            let status = xhr.status;
            if (requestURL.startsWith('file:') && status === 0) {
                status = 200;
            }

            /* eslint-disable-next-line compat/compat */
            resolve(new Response(xhr.responseText, { status }));
        };

        // 设置错误处理回调函数
        xhr.onerror = () => {
            reject(new TypeError('Local request failed'));
        };

        // 初始化 GET 请求
        xhr.open('GET', url);

        // 如果提供了缓存选项，则设置 Cache-Control 请求头
        if (options?.cache) {
            xhr.setRequestHeader('Cache-Control', options.cache);
        }

        // 发送请求
        xhr.send(null);
    });
}
