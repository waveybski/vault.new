$git = "C:\Program Files\Git\cmd\git.exe"
& $git config user.email "vault@secure-chat.local"
& $git config user.name "Vault Developer"
& $git add .
& $git commit -m "Initial commit: Secure Chat Vault v0.2.0 with Neon DB"
& $git push -u origin master