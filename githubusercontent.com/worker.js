// ================== 配置区（所有可变信息都在这里） ==================

// 源站（被反代的 githubusercontent 域）
const ORIGIN_SCHEME = "https:";                       // 源站协议
const ORIGIN_ASSET_DOMAIN = "githubusercontent.com";  // 源站根域名
const MIRROR_ASSET_DOMAIN = "6githubusercontent.com"; // 镜像根域名（你自己的域）

// 当“目标源站 host”为以下时，直接跳 HELP
// ⚠ 不包含 raw.githubusercontent.com，避免破坏 Raw 加速
const BLOCKED_ORIGIN_HOSTS = [
  "user-images.githubusercontent.com",
];

// 由于直接反代会导致误报钓鱼，在这些页面路径访问时跳 HELP
// 规则：
//  - pathname === "/"  时跳 HELP
//  - pathname 中只要包含 /login /signup /copilot 任意一个就跳 HELP
const BLOCKED_PATH_KEYWORDS = ["/login", "/signup", "/copilot"];

// HELP 页面 URL（你的帮助页）
const HELP_PAGE_URL = "https://help.6github.com/";

// 是否在“文本响应 body”里把 githubusercontent.com → 6githubusercontent.com
// 为了极致加速，默认 false，只做纯反代 + CSP 清理
const REWRITE_ASSET_LINKS_IN_BODY = false;

// ================== 主入口 ==================

export default {
  async fetch(request, env, ctx) {
    const clientUrl = new URL(request.url);
    const hostname = clientUrl.hostname;

    // 0. Host 检测：只允许 MIRROR_ASSET_DOMAIN 及其子域名
    if (!isAllowedHost(hostname)) {
      return new Response("Forbidden Host", { status: 403 });
    }

    // 1. 计算对应的源站 URL（例如 raw.6githubusercontent.com → raw.githubusercontent.com）
    const targetUrl = buildOriginUrl(clientUrl);

    // 2. 检查是否需要跳 HELP（根据“客户端路径”和“目标源站 host”）
    if (shouldRedirectToHelp(clientUrl, targetUrl)) {
      return Response.redirect(HELP_PAGE_URL, 302);
    }

    // 3. 构造发往源站的请求（不改 Accept-Encoding，保持压缩）
    const originRequest = buildOriginRequest(request, targetUrl);

    // 4. 请求源站
    const originResponse = await fetch(originRequest);

    // 5. 处理响应（重写 Location / 删除 CSP / 可选 body 替换）
    const finalResponse = await handleResponse(originResponse, clientUrl);

    return finalResponse;
  },
};

// ================== 工具函数 ==================

/**
 * Host 检测：
 *  - 允许：
 *      MIRROR_ASSET_DOMAIN       (如 6githubusercontent.com)
 *      *.MIRROR_ASSET_DOMAIN     (如 raw.6githubusercontent.com)
 *  - 其他 Host 全部拒绝
 */
function isAllowedHost(hostname) {
  if (hostname === MIRROR_ASSET_DOMAIN) return true;
  if (hostname.endsWith("." + MIRROR_ASSET_DOMAIN)) return true;
  return false;
}

/**
 * 把镜像域名（6githubusercontent.com）转换成源站域名（githubusercontent.com）
 * 例如：
 *   6githubusercontent.com           -> githubusercontent.com
 *   raw.6githubusercontent.com       -> raw.githubusercontent.com
 *   avatars0.6githubusercontent.com  -> avatars0.githubusercontent.com
 */
function buildOriginUrl(clientUrl) {
  const originUrl = new URL(clientUrl.toString());
  const hostname = originUrl.hostname;

  if (hostname === MIRROR_ASSET_DOMAIN) {
    originUrl.hostname = ORIGIN_ASSET_DOMAIN;
  } else if (hostname.endsWith("." + MIRROR_ASSET_DOMAIN)) {
    // raw.6githubusercontent.com → raw.githubusercontent.com
    const prefix = hostname.slice(0, -MIRROR_ASSET_DOMAIN.length); // 包含最后那个点
    originUrl.hostname = prefix + ORIGIN_ASSET_DOMAIN;             // raw. + githubusercontent.com
  }

  originUrl.protocol = ORIGIN_SCHEME;
  return originUrl;
}

/**
 * 判断是否需要跳转到 HELP：
 *  - 目标源站 host 在 BLOCKED_ORIGIN_HOSTS 中
 *  - 当且仅当 pathname === "/" 时跳 HELP
 *  - 只要 pathname 中包含 /login /signup /copilot 任意一个，就跳 HELP
 */
function shouldRedirectToHelp(clientUrl, targetUrl) {
  const pathname = clientUrl.pathname.toLowerCase();
  const originHost = targetUrl.hostname.toLowerCase();

  // 1. 目标源站 host 命中禁止列表
  if (BLOCKED_ORIGIN_HOSTS.includes(originHost)) {
    return true;
  }

  // 2. 当且仅当路径是根路径 "/" 时跳 HELP
  if (pathname === "/") {
    return true;
  }

  // 3. 路径中只要包含 /login /signup /copilot 任意一个就跳 HELP
  for (const key of BLOCKED_PATH_KEYWORDS) {
    if (pathname.includes(key)) {
      return true;
    }
  }

  return false;
}

/**
 * 根据原始请求构造发往源站的 Request
 */
function buildOriginRequest(clientRequest, targetUrl) {
  const newHeaders = new Headers(clientRequest.headers);

  // Host 改成源站域名
  newHeaders.set("Host", targetUrl.hostname);

  // Referer 改到源站，减少安全策略问题
  try {
    const referer = newHeaders.get("Referer");
    if (referer) {
      const refUrl = new URL(referer);
      refUrl.hostname = targetUrl.hostname;
      refUrl.protocol = targetUrl.protocol;
      newHeaders.set("Referer", refUrl.toString());
    }
  } catch (e) {
    // Referer 非法时忽略
  }

  // ⚠ 对资源域名来说，不用改 Accept-Encoding，直接透传，保持压缩、速度更快

  const init = {
    method: clientRequest.method,
    headers: newHeaders,
    redirect: "manual", // 自己处理 Location
  };

  if (clientRequest.method !== "GET" && clientRequest.method !== "HEAD") {
    init.body = clientRequest.body;
  }

  return new Request(targetUrl.toString(), init);
}

/**
 * 处理源站响应：
 * - 重写 Location 中的 githubusercontent 域名为镜像域名
 * - 删除 CSP 头，避免 default-src 'none' 之类限制
 * - 默认不改 body（极致加速）；如需改，可打开 REWRITE_ASSET_LINKS_IN_BODY
 */
async function handleResponse(originResponse, clientUrl) {
  const newHeaders = new Headers(originResponse.headers);

  // 1. 重写重定向 Location
  const location = newHeaders.get("Location");
  if (location) {
    newHeaders.set("Location", rewriteLocation(location, clientUrl));
  }

  // 2. 删除 CSP（包括各种变体），避免 default-src 'none'
  stripCspHeaders(newHeaders);

  // 3. 默认：不改 body，直接透传（保持 gzip/br 压缩）
  if (!REWRITE_ASSET_LINKS_IN_BODY) {
    return new Response(originResponse.body, {
      status: originResponse.status,
      statusText: originResponse.statusText,
      headers: newHeaders,
    });
  }

  // 4. 可选：对“文本内容”做 githubusercontent.com → 6githubusercontent.com 替换
  const contentType = newHeaders.get("Content-Type") || "";
  const isTextLike =
    /text\/|application\/javascript|application\/json|application\/xml|application\/xhtml\+xml/.test(
      contentType
    );

  if (!isTextLike) {
    // 二进制/图片直接透传
    return new Response(originResponse.body, {
      status: originResponse.status,
      statusText: originResponse.statusText,
      headers: newHeaders,
    });
  }

  let text = await originResponse.text();
  text = text.split(ORIGIN_ASSET_DOMAIN).join(MIRROR_ASSET_DOMAIN);

  newHeaders.delete("Content-Encoding");
  newHeaders.delete("Content-Length");

  return new Response(text, {
    status: originResponse.status,
    statusText: originResponse.statusText,
    headers: newHeaders,
  });
}

/**
 * 重写 Location 里的 githubusercontent 域名为镜像域名
 */
function rewriteLocation(locationValue, clientUrl) {
  try {
    const locUrl = new URL(locationValue, clientUrl);
    const host = locUrl.hostname;

    // 把 xxx.githubusercontent.com 改成 xxx.6githubusercontent.com
    if (host === ORIGIN_ASSET_DOMAIN) {
      locUrl.hostname = MIRROR_ASSET_DOMAIN;
    } else if (host.endsWith("." + ORIGIN_ASSET_DOMAIN)) {
      const prefix = host.slice(0, -ORIGIN_ASSET_DOMAIN.length); // 包含点
      locUrl.hostname = prefix + MIRROR_ASSET_DOMAIN;
    }

    return locUrl.toString();
  } catch (e) {
    // 如果不是合法 URL，就字符串兜底
    return locationValue.split(ORIGIN_ASSET_DOMAIN).join(MIRROR_ASSET_DOMAIN);
  }
}

/**
 * 删除 CSP 相关 Header（用于资源域名，避免 default-src 'none'）
 */
function stripCspHeaders(headers) {
  headers.delete("Content-Security-Policy");
  headers.delete("Content-Security-Policy-Report-Only");
  headers.delete("X-Content-Security-Policy");
  headers.delete("X-WebKit-CSP");
}
