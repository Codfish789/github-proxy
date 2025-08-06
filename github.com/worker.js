export default {
  async fetch(request, env, ctx) {
    // 配置变量
    const PROXY_DOMAIN = '6github.com';
    const TARGET_DOMAIN = 'github.com';
    const HELP_BASE_URL = 'https://help.6github.com';
    const HELP_HOME_URL = `${HELP_BASE_URL}/`;
    const HELP_WARNING_URL = `${HELP_BASE_URL}/warning`;
    
    // 需要重定向到警告页面的路径
    const WARNING_PATHS = ['/login', '/signup', '/copilot'];
    
    // CORS 配置
    const CORS_HEADERS = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
    
    // 需要移除的 Cloudflare 头部
    const CF_HEADERS_TO_REMOVE = ['cf-connecting-ip', 'cf-ray', 'cf-visitor'];
    
    const url = new URL(request.url);
    const hostname = url.hostname;
    const pathname = url.pathname;
    
    // 检查是否是代理域名
    if (!hostname.endsWith(`.${PROXY_DOMAIN}`) && hostname !== PROXY_DOMAIN) {
      return new Response('Invalid domain', { status: 400 });
    }
    
    // 处理特定路径的重定向
    if (pathname === '/') {
      return Response.redirect(HELP_HOME_URL, 302);
    }
    
    if (WARNING_PATHS.includes(pathname)) {
      return Response.redirect(HELP_WARNING_URL, 302);
    }
    
    // 构建目标URL
    let targetHostname;
    
    // 处理子域名映射
    if (hostname === PROXY_DOMAIN) {
      targetHostname = TARGET_DOMAIN;
    } else if (hostname.endsWith(`.${PROXY_DOMAIN}`)) {
      // 将*.6github.com映射到*.github.com
      // 例如: api.6github.com -> api.github.com
      //      raw.6github.com -> raw.github.com
      targetHostname = hostname.replace(`.${PROXY_DOMAIN}`, `.${TARGET_DOMAIN}`);
    } else {
      return new Response('Invalid domain mapping', { status: 400 });
    }
    
    // 构建完整的目标URL
    const targetUrl = new URL(request.url);
    targetUrl.hostname = targetHostname;
    
    // 创建新的请求
    const newRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'manual'
    });
    
    // 修改请求头中的Host
    const newHeaders = new Headers(newRequest.headers);
    newHeaders.set('Host', targetHostname);
    
    // 移除可能导致问题的头部
    CF_HEADERS_TO_REMOVE.forEach(header => {
      newHeaders.delete(header);
    });
    
    // 创建最终请求
    const finalRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: newHeaders,
      body: request.body,
      redirect: 'manual'
    });
    
    try {
      // 发送请求到GitHub
      const response = await fetch(finalRequest);
      
      // 创建新的响应
      const newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
      
      // 修改响应头
      const responseHeaders = new Headers(newResponse.headers);
      
      // 添加CORS头部
      Object.entries(CORS_HEADERS).forEach(([key, value]) => {
        responseHeaders.set(key, value);
      });
      
      // 处理重定向响应中的Location头
      if (response.status >= 300 && response.status < 400) {
        const location = responseHeaders.get('Location');
        if (location) {
          try {
            const locationUrl = new URL(location);
            if (locationUrl.hostname.endsWith(`.${TARGET_DOMAIN}`) || locationUrl.hostname === TARGET_DOMAIN) {
              // 将GitHub域名替换为代理域名
              if (locationUrl.hostname === TARGET_DOMAIN) {
                locationUrl.hostname = PROXY_DOMAIN;
              } else {
                locationUrl.hostname = locationUrl.hostname.replace(`.${TARGET_DOMAIN}`, `.${PROXY_DOMAIN}`);
              }
              responseHeaders.set('Location', locationUrl.toString());
            }
          } catch (e) {
            // 如果Location不是有效URL，保持原样
          }
        }
      }
      
      // 处理HTML内容中的链接替换（可选）
      const contentType = responseHeaders.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        let html = await response.text();
        
        // 替换HTML中的GitHub链接为代理链接
        const githubUrlPattern = new RegExp(`https://${TARGET_DOMAIN.replace('.', '\\.')}`, 'g');
        const githubSubdomainPattern = new RegExp(`https://([^\\s"']+)\\.${TARGET_DOMAIN.replace('.', '\\.')}`, 'g');
        
        html = html.replace(githubUrlPattern, `https://${PROXY_DOMAIN}`);
        html = html.replace(githubSubdomainPattern, `https://$1.${PROXY_DOMAIN}`);
        
        return new Response(html, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders
        });
      }
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
      
    } catch (error) {
      console.error('Proxy error:', error);
      return new Response('Proxy Error: ' + error.message, { 
        status: 500,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8'
        }
      });
    }
  }
};