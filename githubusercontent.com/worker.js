export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = url.hostname;
    
    // 确定目标域名
    let targetHostname;
    
    // 处理主域名和子域名
    if (hostname === '6githubusercontent.com') {
      targetHostname = 'githubusercontent.com';
    } else if (hostname.endsWith('.6githubusercontent.com')) {
      // 处理子域名，如 raw.6githubusercontent.com -> raw.githubusercontent.com
      targetHostname = hostname.replace('.6githubusercontent.com', '.githubusercontent.com');
    } else {
      // 如果不是目标域名，返回404
      return new Response('Not Found', { status: 404 });
    }
    
    // 构建目标URL
    const targetUrl = new URL(request.url);
    targetUrl.hostname = targetHostname;
    
    // 创建新的请求
    const modifiedRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'manual'
    });
    
    try {
      // 发送请求到目标服务器
      const response = await fetch(modifiedRequest);
      
      // 修改响应头
      const newHeaders = new Headers(response.headers);
      
      // 处理Location头（重定向）
      if (newHeaders.has('location')) {
        const location = newHeaders.get('location');
        let newLocation = location;
        
        // 替换githubusercontent.com相关域名
        newLocation = newLocation.replace(/https?:\/\/githubusercontent\.com/g, `https://6githubusercontent.com`);
        newLocation = newLocation.replace(/https?:\/\/([^.]+)\.githubusercontent\.com/g, `https://$1.6githubusercontent.com`);
        
        newHeaders.set('location', newLocation);
      }
      
      // 处理CORS头
      newHeaders.set('Access-Control-Allow-Origin', '*');
      newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      newHeaders.set('Access-Control-Allow-Headers', '*');
      
      // 移除一些可能导致问题的头
      newHeaders.delete('x-frame-options');
      newHeaders.delete('content-security-policy');
      newHeaders.delete('content-security-policy-report-only');
      
      // 处理OPTIONS预检请求
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 200,
          headers: newHeaders
        });
      }
      
      // 如果是文本内容，替换其中的域名引用
      const contentType = newHeaders.get('content-type') || '';
      if (contentType.includes('text/') || contentType.includes('application/json') || contentType.includes('application/xml')) {
        let content = await response.text();
        
        // 替换内容中的githubusercontent.com域名引用
        content = content.replace(/https?:\/\/githubusercontent\.com/g, 'https://6githubusercontent.com');
        content = content.replace(/https?:\/\/([^.\s]+)\.githubusercontent\.com/g, 'https://$1.6githubusercontent.com');
        
        return new Response(content, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders
        });
      }
      
      // 对于其他类型的内容（如图片、文件等），直接返回
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
      
    } catch (error) {
      return new Response('代理请求失败: ' + error.message, {
        status: 500,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};