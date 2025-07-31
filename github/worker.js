export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = url.hostname;
    const pathname = url.pathname;
    
    // 检查是否是6github.com域名
    if (!hostname.endsWith('.6github.com') && hostname !== '6github.com') {
      return new Response('Invalid domain', { status: 400 });
    }
    
    // 处理特定路径的重定向
    if (pathname === '/') {
      return Response.redirect('https://help.6github.com/', 302);
    }
    
    if (pathname === '/login' || pathname === '/signup' || pathname === '/copilot') {
      return Response.redirect('https://help.6github.com/warning', 302);
    }
    
    // 构建目标URL
    let targetHostname;
    
    // 处理子域名映射
    if (hostname === '6github.com') {
      targetHostname = 'github.com';
    } else if (hostname.endsWith('.6github.com')) {
      // 将*.6github.com映射到*.github.com
      // 例如: api.6github.com -> api.github.com
      //      raw.6github.com -> raw.github.com
      targetHostname = hostname.replace('.6github.com', '.github.com');
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
    newHeaders.delete('cf-connecting-ip');
    newHeaders.delete('cf-ray');
    newHeaders.delete('cf-visitor');
    
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
      
      // 添加CORS头部（如果需要）
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      // 处理重定向响应中的Location头
      if (response.status >= 300 && response.status < 400) {
        const location = responseHeaders.get('Location');
        if (location) {
          try {
            const locationUrl = new URL(location);
            if (locationUrl.hostname.endsWith('.github.com') || locationUrl.hostname === 'github.com') {
              // 将GitHub域名替换为6GitHub域名
              if (locationUrl.hostname === 'github.com') {
                locationUrl.hostname = '6github.com';
              } else {
                locationUrl.hostname = locationUrl.hostname.replace('.github.com', '.6github.com');
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
        
        // 替换HTML中的GitHub链接为6GitHub链接
        html = html.replace(/https:\/\/github\.com/g, 'https://6github.com');
        html = html.replace(/https:\/\/([^\s"']+)\.github\.com/g, 'https://$1.6github.com');
        
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