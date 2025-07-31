# 使用cloudflare worker加速GitHub

## 搭建需求
一个域名 一个cloudflare账户 一个良好的脑子

## 开始搭建
github.com 文件夹中放的是 \*.github.com/\* 的反代

githubusercontent.com 文件夹放的是 \*.githubusercontent.com/\* 的反代

部署完后，在设置中，找到绑定域名和路由，选择绑定路由

创建两个路由，然后选择你的域名 \*yourdomain.com/\* 和 yourdomain.com/\*

最后在DNS中填入优选IP

| 域名 | DNS记录值 |
|------|-----------|
| yourdomain.com | 这里填入优选的IP(你可以使用我的cf.0721233.xyz) |
| *yourdomain.com | 这里填入优选的IP(你可以使用我的cf.0721233.xyz) |

# 详细教程请见我[博客](https://codfish.top/posts/proxy-gitHub-with-cloudflare/)。