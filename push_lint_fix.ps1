$git = "C:\Program Files\Git\cmd\git.exe"
& $git add .
& $git commit -m "Fix: Resolve all linting errors (impure render, used before declaration, unused vars)"
& $git push origin master