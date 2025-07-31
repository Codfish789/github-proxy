// Cloudflare Worker for GitHub Reverse Proxy

// 危险路径列表 - 这些路径将被重定向到警告页面
const DANGEROUS_PATHS = [
  '/login',
  '/signup', 
  '/copilot',
  '/settings',
  '/billing',
  '/organizations',
  '/enterprise',
  '/marketplace',
  '/sponsors'
];

// GitHub域名映射规则
const GITHUB_DOMAINS = {
  'github.com': '6github.com',
  'raw.githubusercontent.com': 'raw.6githubusercontent.com',
  'gist.github.com': 'gist.6github.com',
  'codeload.github.com': 'codeload.6github.com',
  'api.github.com': 'api.6github.com',
  'avatars.githubusercontent.com': 'avatars.6githubusercontent.com',
  'user-images.githubusercontent.com': 'user-images.6githubusercontent.com'
};

// 读取HTML文件内容
async function getHtmlContent(filename) {
  try {
    // 在Cloudflare Workers环境中，使用fetch读取同目录下的文件
    const response = await fetch(new URL(filename, import.meta.url));
    if (!response.ok) {
      throw new Error(`Failed to load ${filename}`);
    }
    return await response.text();
  } catch (error) {
    console.error(`Error loading ${filename}:`, error);
    // 返回一个简单的错误页面
    return `<!DOCTYPE html>
<html><head><title>Error</title></head>
<body><h1>页面加载失败</h1><p>无法加载 ${filename}</p></body></html>`;
  }
}

// 检查路径是否为危险路径
function isDangerousPath(pathname) {
  return DANGEROUS_PATHS.some(dangerousPath => 
    pathname.startsWith(dangerousPath)
  );
}

// 获取目标GitHub域名
function getTargetDomain(pathname) {
  // 根据路径特征判断应该使用哪个GitHub域名
  if (pathname.includes('/raw/') || pathname.includes('/blob/')) {
    return 'raw.githubusercontent.com';
  }
  if (pathname.startsWith('/gist/')) {
    return 'gist.github.com';
  }
  if (pathname.includes('/archive/') || pathname.includes('/zipball/') || pathname.includes('/tarball/')) {
    return 'codeload.github.com';
  }
  
  // 默认使用github.com
  return 'github.com';
}

// 修改响应内容中的GitHub链接
function modifyContent(content, contentType) {
  if (!contentType || !contentType.includes('text/html')) {
    return content;
  }
  
  let modifiedContent = content;
  
  // 替换GitHub域名为加速域名
  Object.entries(GITHUB_DOMAINS).forEach(([original, accelerated]) => {
    const regex = new RegExp(`https?://${original.replace('.', '\\.')}`, 'g');
    modifiedContent = modifiedContent.replace(regex, `https://${accelerated}`);
  });
  
  return modifiedContent;
}

// 主处理函数
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    // 处理根路径 - 返回首页
    if (pathname === '/' || pathname === '/index.html') {
      const indexHtml = await getHtmlContent('./index.html');
      return new Response(indexHtml, {
        headers: {
          'Content-Type': 'text/html;charset=UTF-8',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }
    
    // 处理警告页面
    if (pathname === '/warning' || pathname === '/warning.html') {
      const warningHtml = await getHtmlContent('./warning.html');
      return new Response(warningHtml, {
        headers: {
          'Content-Type': 'text/html;charset=UTF-8',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }
    
    // 检查是否为危险路径
    if (isDangerousPath(pathname)) {
      const warningUrl = new URL('/warning', request.url);
      warningUrl.searchParams.set('original_path', pathname);
      
      return Response.redirect(warningUrl.toString(), 302);
    }
    
    // GitHub反向代理
    try {
      const targetDomain = getTargetDomain(pathname);
      const targetUrl = new URL(request.url);
      targetUrl.hostname = targetDomain;
      targetUrl.protocol = 'https:';
      
      // 创建新的请求
      const modifiedRequest = new Request(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body
      });
      
      // 修改请求头
      modifiedRequest.headers.set('Host', targetDomain);
      modifiedRequest.headers.set('Referer', `https://${targetDomain}`);
      modifiedRequest.headers.delete('CF-Connecting-IP');
      modifiedRequest.headers.delete('CF-Ray');
      
      // 发送请求到GitHub
      const response = await fetch(modifiedRequest);
      
      // 创建新的响应
      const modifiedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
      
      // 修改响应头
      modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
      modifiedResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      modifiedResponse.headers.set('Access-Control-Allow-Headers', '*');
      
      // 对于HTML内容，修改其中的GitHub链接
      const contentType = response.headers.get('Content-Type');
      if (contentType && contentType.includes('text/html')) {
        const content = await response.text();
        const modifiedContent = modifyContent(content, contentType);
        
        return new Response(modifiedContent, {
          status: response.status,
          statusText: response.statusText,
          headers: modifiedResponse.headers
        });
      }
      
      return modifiedResponse;
      
    } catch (error) {
      console.error('Proxy error:', error);
      
      return new Response('代理服务暂时不可用，请稍后重试。', {
        status: 502,
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8'
        }
      });
    }
  }
};