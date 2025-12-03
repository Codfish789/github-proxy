// ================== 配置区（所有可变信息都在这里） ==================

// 源站（被反代的站点）
const ORIGIN_SCHEME = "https:";                    // 源站协议
const ORIGIN_MAIN_DOMAIN = "github.com";           // 源站主域名
const ORIGIN_MAIN_SUFFIX = ".github.com";          // 源站子域名后缀

// 镜像站（你自己的域名）
const MIRROR_MAIN_DOMAIN = "6github.com";          // 镜像主域名
const MIRROR_MAIN_SUFFIX = ".6github.com";         // 镜像子域名后缀

// 静态资源域名覆写（如 raw / avatars 等）
const ORIGIN_ASSET_DOMAIN = "githubusercontent.com";
const MIRROR_ASSET_DOMAIN = "6githubusercontent.com";

// 分析/统计域名（如 collector.github.com）
const ORIGIN_COLLECTOR_DOMAIN = `collector.${ORIGIN_MAIN_DOMAIN}`;   // collector.github.com
const MIRROR_COLLECTOR_DOMAIN = `collector.${MIRROR_MAIN_DOMAIN}`;   // collector.6github.com

// 是否在响应内容中把 github.com → 6github.com（保持站内跳转全部走镜像）
const REWRITE_GITHUB_LINKS_IN_BODY = true;

// 由于直接反代会导致误报钓鱼，在这些片段出现时跳 HELP
const BLOCKED_PATH_KEYWORDS = ["/login", "/signup", "/copilot"];

// HELP 页面 URL
const HELP_PAGE_URL = "https://help.6github.com/";

// =============================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = url.hostname;

    // 0. Host 检测：只允许 6github 主域 / 子域 以及 6githubusercontent 主域 / 子域
    if (!isAllowedHost(hostname)) {
      return new Response("Forbidden Host", { status: 403 });
    }

    // 1. 检查是否需要跳转到 HELP 页面
    if (shouldRedirectToHelp(url)) {
      return Response.redirect(HELP_PAGE_URL, 302);
    }

    // 2. 把镜像域名转换成源站域名
    const targetUrl = buildOriginUrl(url);

    // 3. 构造发往源站的请求
    const originRequest = buildOriginRequest(request, targetUrl);

    // 4. 向 GitHub 源站发起请求
    const originResponse = await fetch(originRequest);

    // 5. 处理响应（覆写域名、处理 Location、CSP、文本替换等）
    const finalResponse = await handleResponse(originResponse, url);

    return finalResponse;
  },
};

// ================== 工具函数 ==================

/**
 * Host 检测：
 *  - 允许：
 *      MIRROR_MAIN_DOMAIN         (如 6github.com)
 *      *.MIRROR_MAIN_SUFFIX       (如 api.6github.com)
 *      MIRROR_ASSET_DOMAIN        (如 6githubusercontent.com)
 *      *.MIRROR_ASSET_DOMAIN      (如 raw.6githubusercontent.com)
 */
function isAllowedHost(hostname) {
  if (hostname === MIRROR_MAIN_DOMAIN) return true;
  if (hostname.endsWith(MIRROR_MAIN_SUFFIX)) return true;

  if (hostname === MIRROR_ASSET_DOMAIN) return true;
  if (hostname.endsWith("." + MIRROR_ASSET_DOMAIN)) return true;

  return false;
}

/**
 * 判断是否命中需要跳 HELP 页的路径
 * 规则：
 *  - 当且仅当 pathname === "/" 时跳 HELP
 *  - 只要 pathname 中包含 /login /signup /copilot 任意一个，就跳 HELP
 */
function shouldRedirectToHelp(url) {
  const pathname = url.pathname.toLowerCase();

  // 当且仅当路径是根路径 "/" 时，跳转到 HELP
  if (pathname === "/") {
    return true;
  }

  // 路径中只要包含 /login /signup /copilot 任意一个就跳 HELP
  for (const key of BLOCKED_PATH_KEYWORDS) {
    if (pathname.includes(key)) {
      return true;
    }
  }

  return false;
}

/**
 * 根据当前请求 URL 构造发往源站（github.com / githubusercontent.com 等）的 URL
 */
function buildOriginUrl(clientUrl) {
  const originUrl = new URL(clientUrl.toString());
  const hostname = originUrl.hostname;

  // 镜像主域名 → 源站主域名
  if (hostname === MIRROR_MAIN_DOMAIN) {
    originUrl.hostname = ORIGIN_MAIN_DOMAIN;
  }
  // 子域镜像 → 源站子域名，例如 api.6github.com → api.github.com
  else if (hostname.endsWith(MIRROR_MAIN_SUFFIX)) {
    originUrl.hostname =
      hostname.slice(0, -MIRROR_MAIN_SUFFIX.length) + ORIGIN_MAIN_SUFFIX;
  }
  // 静态资源镜像域名 → 源资源域名，例如 avatars.6githubusercontent.com
  else if (hostname === MIRROR_ASSET_DOMAIN) {
    originUrl.hostname = ORIGIN_ASSET_DOMAIN;
  } else if (hostname.endsWith("." + MIRROR_ASSET_DOMAIN)) {
    // xxx.6githubusercontent.com → xxx.githubusercontent.com
    originUrl.hostname =
      hostname.slice(0, -(".".length + MIRROR_ASSET_DOMAIN.length)) +
      "." +
      ORIGIN_ASSET_DOMAIN;
  }

  originUrl.protocol = ORIGIN_SCHEME;
  return originUrl;
}

/**
 * 根据原始请求构造发往源站的 Request
 */
function buildOriginRequest(clientRequest, targetUrl) {
  const newHeaders = new Headers(clientRequest.headers);

  // Host 必须改成源站域名
  newHeaders.set("Host", targetUrl.hostname);

  // Referer 尽量改为源站，避免某些安全策略问题
  try {
    const referer = newHeaders.get("Referer");
    if (referer) {
      const refUrl = new URL(referer);
      refUrl.hostname = targetUrl.hostname;
      refUrl.protocol = targetUrl.protocol;
      newHeaders.set("Referer", refUrl.toString());
    }
  } catch (e) {
    // 如果 Referer 不是合法 URL，忽略即可
  }

  // Accept-Encoding 去掉，避免 gzip 后我们还要改内容
  newHeaders.delete("Accept-Encoding");

  const init = {
    method: clientRequest.method,
    headers: newHeaders,
    redirect: "manual", // 不自动跟随重定向，方便我们自己改 Location
  };

  // GET/HEAD 没有 body
  if (clientRequest.method !== "GET" && clientRequest.method !== "HEAD") {
    init.body = clientRequest.body;
  }

  return new Request(targetUrl.toString(), init);
}

/**
 * 处理源站的响应：
 * - 重写 Location 中的域名（重定向仍然走镜像域名）
 * - Patch CSP（追加 6 域名到 script-src / connect-src / img-src）
 * - 文本内容中替换 githubusercontent.com → 6githubusercontent.com
 * - 文本内容中可选替换 github.com → 6github.com（避免 66github 的问题）
 */
async function handleResponse(originResponse, clientUrl) {
  const newHeaders = new Headers(originResponse.headers);

  // 1. 重写重定向 Location 头
  const location = newHeaders.get("Location");
  if (location) {
    newHeaders.set("Location", rewriteLocation(location, clientUrl));
  }

  // 2. Patch CSP：让浏览器允许访问你的镜像域名（script-src / connect-src / img-src）
  patchCspHeaders(newHeaders);

  // 3. 非文本内容（图片、二进制等）直接透传
  const contentType = newHeaders.get("Content-Type") || "";
  const isTextLike =
    /text\/|application\/javascript|application\/json|application\/xml|application\/xhtml\+xml/.test(
      contentType
    );

  if (!isTextLike) {
    return new Response(originResponse.body, {
      status: originResponse.status,
      statusText: originResponse.statusText,
      headers: newHeaders,
    });
  }

  // 4. 文本内容：读出文本，做域名替换
  let text = await originResponse.text();

  // 先替换 githubusercontent.com → 6githubusercontent.com（头像、raw 等）
  text = text.replaceAll(ORIGIN_ASSET_DOMAIN, MIRROR_ASSET_DOMAIN);

  // 再可选替换 github.com → 6github.com（注意只做一次，避免 66github）
  if (REWRITE_GITHUB_LINKS_IN_BODY) {
    text = text.replaceAll(ORIGIN_MAIN_DOMAIN, MIRROR_MAIN_DOMAIN);
  }

  // 5. 因为我们改了 body，Content-Encoding / Content-Length 需要删掉
  newHeaders.delete("Content-Encoding");
  newHeaders.delete("Content-Length");

  return new Response(text, {
    status: originResponse.status,
    statusText: originResponse.statusText,
    headers: newHeaders,
  });
}

/**
 * 重写 Location 里的域名（重定向仍然走镜像域名）
 */
function rewriteLocation(locationValue, clientUrl) {
  try {
    const locUrl = new URL(locationValue, clientUrl);

    // 对 github.com 主站域名的重定向做处理
    if (
      locUrl.hostname === ORIGIN_MAIN_DOMAIN ||
      locUrl.hostname.endsWith(ORIGIN_MAIN_SUFFIX)
    ) {
      if (locUrl.hostname === ORIGIN_MAIN_DOMAIN) {
        locUrl.hostname = MIRROR_MAIN_DOMAIN;
      } else {
        locUrl.hostname =
          locUrl.hostname.slice(0, -ORIGIN_MAIN_SUFFIX.length) +
          MIRROR_MAIN_SUFFIX;
      }
    }

    // 对 githubusercontent.com 做镜像转换
    if (
      locUrl.hostname === ORIGIN_ASSET_DOMAIN ||
      locUrl.hostname.endsWith("." + ORIGIN_ASSET_DOMAIN)
    ) {
      if (locUrl.hostname === ORIGIN_ASSET_DOMAIN) {
        locUrl.hostname = MIRROR_ASSET_DOMAIN;
      } else {
        locUrl.hostname =
          locUrl.hostname.slice(
            0,
            -(".".length + ORIGIN_ASSET_DOMAIN.length)
          ) +
          "." +
          MIRROR_ASSET_DOMAIN;
      }
    }

    return locUrl.toString();
  } catch (e) {
    // 如果 Location 不是合法 URL，就做一个简单字符串替换兜底
    let result = locationValue.replaceAll(
      ORIGIN_ASSET_DOMAIN,
      MIRROR_ASSET_DOMAIN
    );

    if (REWRITE_GITHUB_LINKS_IN_BODY) {
      result = result.replaceAll(ORIGIN_MAIN_DOMAIN, MIRROR_MAIN_DOMAIN);
    }

    return result;
  }
}

/**
 * Patch CSP 相关 Header：
 *  - script-src 追加 'self' 和 https://6github.com（让 Cloudflare 自己的脚本不被挡）
 *  - connect-src 追加 6github / api.6github / 6githubusercontent / *.6githubusercontent / collector.6github.com
 *  - img-src 追加 6github / 6githubusercontent / *.6githubusercontent（让头像等图片能正常加载）
 */
function patchCspHeaders(headers) {
  const names = ["Content-Security-Policy", "Content-Security-Policy-Report-Only"];
  for (const name of names) {
    const value = headers.get(name);
    if (!value) continue;
    headers.set(name, patchCspValue(value));
  }
}

function patchCspValue(csp) {
  const extraScriptSrc = [
    "'self'",
    `https://${MIRROR_MAIN_DOMAIN}`,
  ];

  const extraConnectSrc = [
    `https://${MIRROR_MAIN_DOMAIN}`,
    `https://api.${MIRROR_MAIN_DOMAIN}`,
    `https://${MIRROR_ASSET_DOMAIN}`,
    `https://*.${MIRROR_ASSET_DOMAIN}`,
    `https://${MIRROR_COLLECTOR_DOMAIN}`,    // collector.6github.com，修复你看到的 connect-src 报错
  ];

  const extraImgSrc = [
    `https://${MIRROR_MAIN_DOMAIN}`,
    `https://${MIRROR_ASSET_DOMAIN}`,
    `https://*.${MIRROR_ASSET_DOMAIN}`,
  ];

  // script-src 只在存在时追加（防止创建新的 script-src 覆盖原策略）
  csp = appendToExistingDirective(csp, "script-src", extraScriptSrc);

  // connect-src / img-src 如果不存在，就新增一个
  csp = appendOrAddDirective(csp, "connect-src", extraConnectSrc);
  csp = appendOrAddDirective(csp, "img-src", extraImgSrc);

  return csp;
}

/**
 * 只在 directive 存在时追加（用于 script-src，避免创建新的 script-src）
 */
function appendToExistingDirective(csp, directiveName, extraSources) {
  const re = new RegExp(`\\b${directiveName}\\b([^;]+)`);
  if (!re.test(csp)) return csp;

  return csp.replace(re, (match, value) => {
    let updated = value; // value 前面自带空格
    for (const src of extraSources) {
      if (!updated.includes(src)) {
        updated += " " + src;
      }
    }
    return directiveName + updated;
  });
}

/**
 * directive 存在就追加，不存在就新增（用于 connect-src / img-src）
 */
function appendOrAddDirective(csp, directiveName, extraSources) {
  const re = new RegExp(`\\b${directiveName}\\b([^;]+)`);
  if (!re.test(csp)) {
    const value = extraSources.join(" ");
    return csp + `; ${directiveName} ${value}`;
  }

  return csp.replace(re, (match, value) => {
    let updated = value;
    for (const src of extraSources) {
      if (!updated.includes(src)) {
        updated += " " + src;
      }
    }
    return directiveName + updated;
  });
}
