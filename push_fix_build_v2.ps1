$git = "C:\Program Files\Git\cmd\git.exe"
& $git add .
& $git commit -m "Fix: Remove bad variable reference causing build fail"
& $git push origin master