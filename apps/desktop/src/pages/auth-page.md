# AuthPage 页面

## 作用
- 提供登录/注册入口。
- 成功后由路由守卫自动跳转到 `/chat`。

## 依赖
- `useAuth()`：调用 `loginByPassword` / `registerByPassword`。

## 路由
- `/auth`
