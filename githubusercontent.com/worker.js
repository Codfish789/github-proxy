export default {
  async fetch(request, env, ctx) {
    // 配置变量
    const PROXY_DOMAIN = '6githubusercontent.com';
    const TARGET_DOMAIN = 'githubusercontent.com';
    const HELP_WARNING_URL = 'https://help.6github.com/warning';
    
    // 需要重定向到警告页面的子域名
    const WARNING_PATHS = ['user-images'];
    
    // CORS 配置
    const CORS_HEADERS = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    };
    
    // 需要移除的安全头部
    const SECURITY_HEADERS_TO_REMOVE = [
      'x-frame-options',
      'content-security-policy',
      'content-security-policy-report-only'
    ];
    
    // 支持域名替换的内容类型
    const TEXT_CONTENT_TYPES = ['text/', 'application/json', 'application/xml'];
    
    const url = new URL(request.url);
    const hostname = url.hostname;
    
    // 检查是否是需要重定向到警告页面的子域名
    const subdomain = hostname.replace(`.${PROXY_DOMAIN}`, '');
    if (WARNING_PATHS.includes(subdomain) && hostname.endsWith(`.${PROXY_DOMAIN}`)) {
      return Response.redirect(HELP_WARNING_URL, 302);
    }
    
    // 确定目标域名
    let targetHostname;
    
    // 处理主域名和子域名
    if (hostname === PROXY_DOMAIN) {
      targetHostname = TARGET_DOMAIN;
    } else if (hostname.endsWith(`.${PROXY_DOMAIN}`)) {
      // 处理子域名，如 raw.6githubusercontent.com -> raw.githubusercontent.com
      targetHostname = hostname.replace(`.${PROXY_DOMAIN}`, `.${TARGET_DOMAIN}`);
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
        
        // 替换目标域名相关域名为代理域名
        const targetDomainPattern = new RegExp(`https?://${TARGET_DOMAIN.replace('.', '\\.')}`, 'g');
        const targetSubdomainPattern = new RegExp(`https?://([^.]+)\\.${TARGET_DOMAIN.replace('.', '\\.')}`, 'g');
        
        newLocation = newLocation.replace(targetDomainPattern, `https://${PROXY_DOMAIN}`);
        newLocation = newLocation.replace(targetSubdomainPattern, `https://$1.${PROXY_DOMAIN}`);
        
        newHeaders.set('location', newLocation);
      }
      
      // 添加CORS头部
      Object.entries(CORS_HEADERS).forEach(([key, value]) => {
        newHeaders.set(key, value);
      });
      
      // 移除安全相关头部
      SECURITY_HEADERS_TO_REMOVE.forEach(header => {
        newHeaders.delete(header);
      });
      
      // 处理OPTIONS预检请求
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 200,
          headers: newHeaders
        });
      }
      
      // 如果是文本内容，替换其中的域名引用
      const contentType = newHeaders.get('content-type') || '';
      const isTextContent = TEXT_CONTENT_TYPES.some(type => contentType.includes(type));
      
      if (isTextContent) {
        let content = await response.text();
        
        // 替换内容中的目标域名引用为代理域名
        const contentTargetDomainPattern = new RegExp(`https?://${TARGET_DOMAIN.replace('.', '\\.')}`, 'g');
        const contentTargetSubdomainPattern = new RegExp(`https?://([^.\\s]+)\\.${TARGET_DOMAIN.replace('.', '\\.')}`, 'g');
        
        content = content.replace(contentTargetDomainPattern, `https://${PROXY_DOMAIN}`);
        content = content.replace(contentTargetSubdomainPattern, `https://$1.${PROXY_DOMAIN}`);
        
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