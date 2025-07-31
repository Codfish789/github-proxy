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

// 嵌入的HTML内容
const INDEX_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GitHub加速服务</title>
    <style>
        :root {
            --primary-color: #2563eb;
            --secondary-color: #1e40af;
            --text-color: #1f2937;
            --light-text: #6b7280;
            --background: #f9fafb;
            --card-bg: #ffffff;
            --border-radius: 16px;
            --shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
            --highlight-color: #f97316; /* 新增高亮颜色 */
            --animation-duration: 0.5s; /* 动画持续时间 */
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
        }
        
        body {
            background-color: var(--background);
            color: var(--text-color);
            line-height: 1.6;
            padding: 20px;
        }
        
        .container {
            max-width: 800px;
            margin: 40px auto;
        }
        
        /* 添加动画效果 */
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }
        
        @keyframes slideIn {
            from { transform: translateX(-30px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        .card {
            background-color: var(--card-bg);
            border-radius: var(--border-radius);
            box-shadow: var(--shadow);
            padding: 30px;
            margin-bottom: 30px;
            transition: all 0.4s ease;
            animation: fadeIn var(--animation-duration) ease-out;
        }
        
        .card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 30px -5px rgba(0, 0, 0, 0.15);
        }
        
        h1 {
            color: var(--primary-color);
            margin-bottom: 20px;
            text-align: center;
            font-size: 2.2rem;
            animation: fadeIn calc(var(--animation-duration) * 0.8) ease-out;
        }
        
        h2 {
            color: var(--secondary-color);
            margin: 25px 0 15px;
            font-size: 1.5rem;
            position: relative;
            display: inline-block;
            animation: slideIn var(--animation-duration) ease-out;
        }
        
        h2::after {
            content: '';
            position: absolute;
            bottom: -5px;
            left: 0;
            width: 0;
            height: 2px;
            background-color: var(--primary-color);
            transition: width 0.3s ease;
        }
        
        .card:hover h2::after {
            width: 100%;
        }
        
        p {
            margin-bottom: 15px;
            color: var(--text-color);
            animation: fadeIn calc(var(--animation-duration) * 1.2) ease-out;
        }
        
        .highlight {
            background-color: rgba(37, 99, 235, 0.1);
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid var(--primary-color);
            margin: 20px 0;
            transition: all 0.3s ease;
            animation: fadeIn calc(var(--animation-duration) * 1.4) ease-out;
        }
        
        .highlight:hover {
            transform: translateX(5px);
            box-shadow: 0 5px 15px -3px rgba(0, 0, 0, 0.1);
        }
        
        /* 6githubusercontent.com 醒目样式 */
        .highlight-domain {
            color: var(--highlight-color);
            font-weight: bold;
            position: relative;
            display: inline-block;
            padding: 0 5px;
            transition: all 0.3s ease;
        }
        
        .highlight-domain::before {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 2px;
            background-color: var(--highlight-color);
            transform: scaleX(0);
            transition: transform 0.3s ease;
        }
        
        .highlight-domain:hover {
            color: var(--highlight-color);
            transform: scale(1.1);
        }
        
        .highlight-domain:hover::before {
            transform: scaleX(1);
        }
        
        /* 添加脉冲动画效果 */
        .pulse-animation {
            animation: pulse 2s infinite;
        }
        
        .button {
            display: inline-block;
            background-color: var(--primary-color);
            color: white;
            padding: 12px 24px;
            border-radius: 30px;
            text-decoration: none;
            font-weight: bold;
            margin-top: 15px;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
            z-index: 1;
            animation: fadeIn calc(var(--animation-duration) * 1.6) ease-out;
        }
        
        .button::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
            transition: left 0.7s ease;
            z-index: -1;
        }
        
        .button:hover {
            background-color: var(--secondary-color);
            transform: translateY(-3px);
            box-shadow: 0 10px 20px -5px rgba(30, 64, 175, 0.4);
        }
        
        .button:hover::before {
            left: 100%;
        }
        
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }
        
        .feature {
            background-color: var(--card-bg);
            border-radius: var(--border-radius);
            padding: 20px;
            box-shadow: var(--shadow);
            text-align: center;
            transition: all 0.3s ease;
            animation: fadeIn calc(var(--animation-duration) * 1.2) ease-out;
            animation-fill-mode: both;
        }
        
        .feature:nth-child(1) { animation-delay: 0.1s; }
        .feature:nth-child(2) { animation-delay: 0.2s; }
        .feature:nth-child(3) { animation-delay: 0.3s; }
        
        .feature:hover {
            transform: translateY(-7px) scale(1.03);
            box-shadow: 0 15px 30px -10px rgba(0, 0, 0, 0.15);
        }
        
        .feature-icon {
            font-size: 2.5rem;
            margin-bottom: 15px;
            color: var(--primary-color);
            transition: transform 0.3s ease;
        }
        
        .feature:hover .feature-icon {
            transform: scale(1.2);
        }
        
        footer {
            text-align: center;
            margin-top: 50px;
            color: var(--light-text);
            font-size: 0.9rem;
            animation: fadeIn calc(var(--animation-duration) * 2) ease-out;
        }
        
        /* 列表项动画 */
        ul li {
            transition: all 0.3s ease;
            animation: slideIn var(--animation-duration) ease-out;
            animation-fill-mode: both;
        }
        
        ul li:nth-child(1) { animation-delay: 0.1s; }
        ul li:nth-child(2) { animation-delay: 0.2s; }
        ul li:nth-child(3) { animation-delay: 0.3s; }
        ul li:nth-child(4) { animation-delay: 0.4s; }
        
        ul li:hover {
            transform: translateX(5px);
        }
        
        @media (max-width: 768px) {
            .container {
                padding: 0 15px;
            }
            
            h1 {
                font-size: 1.8rem;
            }
            
            .features {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>GitHub 加速服务</h1>
        
        <div class="card">
            <h2>关于我们的服务</h2>
            <p>我们提供基于 Cloudflare Workers 的 GitHub 访问加速服务，通过反向代理和 IP 优选技术，为中国大陆用户提供更快速、稳定的 GitHub 访问体验。</p>
            
            <div class="highlight">
                <p>无需任何客户端，无需修改 hosts，只需将我们的加速域名替换为原始 GitHub 域名即可立即体验飞一般的速度！</p>
            </div>
        </div>
        
        <div class="features">
            <div class="feature">
                <div class="feature-icon">⚡</div>
                <h3>极速访问</h3>
                <p>通过 Cloudflare 全球网络，大幅提升访问速度</p>
            </div>
            
            <div class="feature">
                <div class="feature-icon">🔄</div>
                <h3>IP 优选</h3>
                <p>智能选择最佳路由，提供稳定连接</p>
            </div>
            
            <div class="feature">
                <div class="feature-icon">🔒</div>
                <h3>安全可靠</h3>
                <p>全程 HTTPS 加密，保障数据安全</p>
            </div>
        </div>
        
        <div class="card">
            <h2>如何使用</h2>
            <p>只需将原始 GitHub 域名替换为我们的加速域名即可：</p>
            
            <div class="highlight">
                <p><strong>原始域名：</strong> github.com</p>
                <p><strong>加速域名：</strong> <span class="highlight-domain">6github.com</span></p>

                <p><strong>原始域名：</strong> raw.githubusercontent.com</p>
                <p><strong>加速域名：</strong> <span class="highlight-domain">raw.6githubusercontent.com</span></p>
            </div>
            
            <p>您无需担心数据泄露风险，所有的代码都会公开到GitHub中，点击访问仓库<a href="https://github.com/Codfish789/github-proxy"><span class="highlight-domain">github-proxy</span></a></p>
            <p>如有问题/建议请发邮件至<span class="highlight-domain">Codfish@codfish.top</span></p>
            <h2>加速的服务</h2>
            <ul style="list-style-position: inside; margin-left: 20px; margin-bottom: 20px;">
                <li>GitHub 网站 - <code>github.com</code> → <code><span class="highlight-domain">6github.com</span></code></li>
                <li>Raw 内容 - <code>raw.githubusercontent.com</code> → <code><span class="highlight-domain">raw.6githubusercontent.com</span></code></li>
                <li>Gist - <code>gist.github.com</code> → <code>gist.<span class="highlight-domain">6github.com</span></code></li>
                <li>下载服务 - <code>codeload.github.com</code> → <code>codeload.<span class="highlight-domain">6github.com</span></code></li>
            </ul>
        </div>
        
        <div class="card">
            <h2>技术原理</h2>
            <p>我们的加速服务基于以下技术：</p>
            
            <ul style="list-style-position: inside; margin-left: 20px; margin-bottom: 20px;">
                <li>Cloudflare Workers 提供全球边缘计算能力</li>
                <li>反向代理技术无缝转发请求到 GitHub 服务器</li>
                <li>IP 优选算法自动选择最佳的连接路径</li>
                <li>智能缓存策略提升重复访问速度</li>
            </ul>
            
            <div class="highlight">
                <p>所有流量均通过 Cloudflare 的全球网络进行传输，大幅降低访问延迟，提升下载速度。</p>
            </div>
        </div>
        
        <footer>
            <p>© 2023 GitHub 加速服务 | 本服务仅用于学习研究，请遵守相关法律法规</p>
        </footer>
    </div>
</body>
</html>`;

const WARNING_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>内容警告 - GitHub加速服务</title>
    <style>
        :root {
            --primary-color: #dc2626; /* 红色作为警告主色调 */
            --secondary-color: #991b1b;
            --text-color: #1f2937;
            --light-text: #6b7280;
            --background: #f9fafb;
            --card-bg: #ffffff;
            --border-radius: 16px;
            --shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
            --animation-duration: 0.5s;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
        }
        
        body {
            background-color: var(--background);
            color: var(--text-color);
            line-height: 1.6;
            padding: 20px;
        }
        
        .container {
            max-width: 800px;
            margin: 40px auto;
        }
        
        /* 添加动画效果 */
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }
        
        @keyframes warning-pulse {
            0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4); }
            70% { box-shadow: 0 0 0 15px rgba(220, 38, 38, 0); }
            100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
        }
        
        .card {
            background-color: var(--card-bg);
            border-radius: var(--border-radius);
            box-shadow: var(--shadow);
            padding: 30px;
            margin-bottom: 30px;
            transition: all 0.4s ease;
            animation: fadeIn var(--animation-duration) ease-out;
        }
        
        .card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 30px -5px rgba(0, 0, 0, 0.15);
        }
        
        .warning-icon {
            font-size: 5rem;
            color: var(--primary-color);
            text-align: center;
            margin: 20px 0;
            animation: warning-pulse 2s infinite;
        }
        
        h1 {
            color: var(--primary-color);
            margin-bottom: 20px;
            text-align: center;
            font-size: 2.2rem;
            animation: fadeIn calc(var(--animation-duration) * 0.8) ease-out;
        }
        
        h2 {
            color: var(--secondary-color);
            margin: 25px 0 15px;
            font-size: 1.5rem;
            position: relative;
            display: inline-block;
        }
        
        p {
            margin-bottom: 15px;
            color: var(--text-color);
            animation: fadeIn calc(var(--animation-duration) * 1.2) ease-out;
        }
        
        .highlight {
            background-color: rgba(220, 38, 38, 0.1);
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid var(--primary-color);
            margin: 20px 0;
            transition: all 0.3s ease;
            animation: fadeIn calc(var(--animation-duration) * 1.4) ease-out;
        }
        
        .highlight:hover {
            transform: translateX(5px);
            box-shadow: 0 5px 15px -3px rgba(0, 0, 0, 0.1);
        }
        
        .button {
            display: inline-block;
            background-color: var(--primary-color);
            color: white;
            padding: 12px 24px;
            border-radius: 30px;
            text-decoration: none;
            font-weight: bold;
            margin-top: 15px;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
            z-index: 1;
        }
        
        .button::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
            transition: left 0.7s ease;
            z-index: -1;
        }
        
        .button:hover {
            background-color: var(--secondary-color);
            transform: translateY(-3px);
            box-shadow: 0 10px 20px -5px rgba(153, 27, 27, 0.4);
        }
        
        .button:hover::before {
            left: 100%;
        }
        
        .button.secondary {
            background-color: #6b7280;
            margin-right: 10px;
        }
        
        .button.secondary:hover {
            background-color: #4b5563;
            box-shadow: 0 10px 20px -5px rgba(75, 85, 99, 0.4);
        }
        
        .reasons {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }
        
        .reason {
            background-color: var(--card-bg);
            border-radius: var(--border-radius);
            padding: 20px;
            box-shadow: var(--shadow);
            text-align: center;
            transition: all 0.3s ease;
            animation: fadeIn calc(var(--animation-duration) * 1.2) ease-out;
            animation-fill-mode: both;
        }
        
        .reason:nth-child(1) { animation-delay: 0.1s; }
        .reason:nth-child(2) { animation-delay: 0.2s; }
        .reason:nth-child(3) { animation-delay: 0.3s; }
        
        .reason:hover {
            transform: translateY(-7px);
            box-shadow: 0 15px 30px -10px rgba(0, 0, 0, 0.15);
        }
        
        .reason-icon {
            font-size: 2.5rem;
            margin-bottom: 15px;
            color: var(--primary-color);
        }
        
        footer {
            text-align: center;
            margin-top: 50px;
            color: var(--light-text);
            font-size: 0.9rem;
            animation: fadeIn calc(var(--animation-duration) * 2) ease-out;
        }
        
        /* 倒计时样式 */
        .countdown {
            font-size: 2rem;
            font-weight: bold;
            text-align: center;
            margin: 20px 0;
            color: var(--primary-color);
        }
        
        @media (max-width: 768px) {
            .container {
                padding: 0 15px;
            }
            
            h1 {
                font-size: 1.8rem;
            }
            
            .reasons {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="warning-icon">⚠️</div>
        <h1>内容警告</h1>
        
        <div class="card">
            <h2>您正在访问的内容可能存在问题</h2>
            <p>我们的系统检测到您尝试访问的内容可能存在以下问题：</p>
            
            <div class="highlight">
                <p>该内容可能违反了GitHub的服务条款或我们的加速服务使用规定。为了保护您和我们的服务，我们已阻止了对该内容的访问。</p>
            </div>
            
            <div class="countdown" id="countdown">10</div>
            <p style="text-align: center;">秒后将自动返回首页</p>
        </div>
        
        <div class="reasons">
            <div class="reason">
                <div class="reason-icon">🔞</div>
                <h3>违规内容</h3>
                <p>包含违法、色情或其他不适当内容</p>
            </div>
            
            <div class="reason">
                <div class="reason-icon">🦠</div>
                <h3>安全风险</h3>
                <p>可能包含恶意代码或病毒</p>
            </div>
            
            <div class="reason">
                <div class="reason-icon">⛔</div>
                <h3>访问限制</h3>
                <p>禁止登录/注册操作，以防止个人数据泄露风险</p>
            </div>
        </div>
        
        <div class="card">
            <h2>您可以选择</h2>
            <p>如果您认为这是一个错误，或者您确信您访问的内容是安全的，您可以：</p>
            
            <ul style="list-style-position: inside; margin-left: 20px; margin-bottom: 20px;">
                <li>联系 Mail: codfish@codfish.top</li>
                <li>通过原始GitHub链接访问该内容（不经过我们的加速服务）</li>
            </ul>
        </div>
        
        <footer>
            <p>© 2023 GitHub 加速服务 | 本服务仅用于学习研究，请遵守相关法律法规</p>
        </footer>
    </div>
    
    <script>
        // 倒计时功能
        let seconds = 10;
        const countdownElement = document.getElementById('countdown');
        const countdownInterval = setInterval(() => {
            seconds--;
            countdownElement.textContent = seconds;
            
            if (seconds <= 0) {
                clearInterval(countdownInterval);
                window.location.href = 'index.html';
            }
        }, 1000);
    </script>
</body>
</html>`;

// 读取HTML文件内容 - 现在直接返回嵌入的内容
function getHtmlContent(filename) {
  if (filename === './index.html' || filename === 'index.html') {
    return INDEX_HTML;
  }
  if (filename === './warning.html' || filename === 'warning.html') {
    return WARNING_HTML;
  }
  
  // 如果请求的文件不存在，返回错误页面
  return `<!DOCTYPE html>
<html><head><title>Error</title></head>
<body><h1>页面加载失败</h1><p>无法加载 ${filename}</p></body></html>`;
}

// ... existing code ...

// 主处理函数
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    // 处理根路径 - 返回首页
    if (pathname === '/' || pathname === '/index.html') {
      const indexHtml = getHtmlContent('index.html');
      return new Response(indexHtml, {
        headers: {
          'Content-Type': 'text/html;charset=UTF-8',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }
    
    // 处理警告页面
    if (pathname === '/warning' || pathname === '/warning.html') {
      const warningHtml = getHtmlContent('warning.html');
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