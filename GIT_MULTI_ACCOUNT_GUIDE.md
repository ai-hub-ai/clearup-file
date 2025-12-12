# GitHub 多账号配置与项目初始化指南

本文档详细记录了在一台电脑上管理多个 GitHub 账号（例如：个人账号 + 公司/组织账号），并初始化项目推送到指定账号的完整流程。

## 场景描述

假设您已经有一个默认的 GitHub 账号（`Account A`），现在需要使用另一个账号（`Account B`，例如 `ai-hub-ai`）来推送代码，且不能干扰默认账号的配置。

---

## 第一步：生成新的 SSH Key

为新的账号生成一对专属的 SSH 密钥，不要覆盖默认的 `id_rsa` 或 `id_ed25519`。

```bash
# -C 后面的注释建议填写账号邮箱或标识，方便区分
# -f 指定密钥文件存储路径和名称 (例如 id_ed25519_aihub)
ssh-keygen -t ed25519 -C "your-email@example.com" -f ~/.ssh/id_ed25519_aihub
```

系统会提示输入密码（Passphrase），可以直接回车留空。

## 第二步：将公钥添加到 GitHub

1.  **复制公钥内容**：
    ```bash
    cat ~/.ssh/id_ed25519_aihub.pub
    ```
    复制输出的以 `ssh-ed25519` 开头的完整字符串。

2.  **添加到 GitHub**：
    *   登录目标 GitHub 账号（`Account B`）。
    *   进入 **Settings** -> **SSH and GPG keys**。
    *   点击 **New SSH key**。
    *   **Title**: 填写易于识别的名称（如 "MacBook Pro Work"）。
    *   **Key**: 粘贴刚才复制的公钥内容。
    *   点击 **Add SSH key** 保存。

## 第三步：配置 SSH Config

修改 `~/.ssh/config` 文件，通过**别名**来区分不同的账号。

1.  打开或创建配置文件：
    ```bash
    nano ~/.ssh/config
    ```

2.  添加如下配置（假设默认账号已经配置，只需追加新账号配置）：

    ```ssh
    # --- 默认账号 (Account A) ---
    Host github.com
      Hostname ssh.github.com
      Port 443
      User git
      IdentityFile ~/.ssh/id_ed25519
      IdentitiesOnly yes

    # --- 新账号 (Account B / ai-hub-ai) ---
    # Host 是别名，之后在 git remote 中会用到
    Host github.com-aihub
      Hostname ssh.github.com
      Port 443
      User git
      # 指定刚才生成的专用密钥
      IdentityFile ~/.ssh/id_ed25519_aihub
      IdentitiesOnly yes
    ```

3.  **测试连接**：
    ```bash
    # 测试新别名是否能正确识别身份
    ssh -T git@github.com-aihub
    ```
    如果成功，会显示：`Hi <Account-B-Name>! You've successfully authenticated...`

---

## 第四步：初始化项目并推送

现在回到您的项目文件夹，进行 Git 初始化和推送。

1.  **初始化仓库**：
    ```bash
    cd /path/to/your/project
    git init
    ```

2.  **添加文件并提交**：
    ```bash
    git add .
    git commit -m "Initial commit"
    ```

3.  **添加远程仓库（关键步骤）**：
    注意：这里不能直接复制 GitHub 提供的 `git@github.com:...` 地址，必须将 `github.com` 替换为您在 Config 中设置的别名 `github.com-aihub`。

    *   **原始地址**: `git@github.com:ai-hub-ai/clearup-file.git`
    *   **修改后地址**: `git@github.com-aihub:ai-hub-ai/clearup-file.git`

    ```bash
    # 添加远程仓库
    git remote add origin git@github.com-aihub:ai-hub-ai/clearup-file.git
    
    # 或者如果已经存在 origin，使用 set-url 修改
    # git remote set-url origin git@github.com-aihub:ai-hub-ai/clearup-file.git
    ```

4.  **推送代码**：
    ```bash
    git push -u origin master
    ```

---

## 常见问题排查

*   **Permission denied (publickey)**: 
    *   检查 `~/.ssh/config` 中的 `IdentityFile` 路径是否正确。
    *   检查公钥是否已正确上传到对应的 GitHub 账号。
    *   确保使用的是别名（如 `github.com-aihub`）而不是原始域名。

*   **端口 22 连接超时**:
    *   部分网络环境（如公司内网）可能屏蔽了 22 端口。
    *   解决方案：在 config 中添加 `Port 443` 和 `Hostname ssh.github.com`（如本文档配置所示）。
