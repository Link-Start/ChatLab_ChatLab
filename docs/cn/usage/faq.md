---
outline: deep
---

# 常见问题

这里汇总 ChatLab 使用中高频出现的问题与处理思路。

## AI相关问题

### 本地模型不调用 Tool Call 怎么办？

可以在系统提示词的最底部增加以下提示：

```text
You have access to tools. If you need information you don’t have, use the provided functions.
```

## 软件异常报错问题

### 无法打开桌面客户端怎么办？

可能是 360 或其他安全软件导致的。请先暂时退出 360 等安全软件，然后重新安装 ChatLab。
