import Control

test = Control.EventEx('龙讨伐', 100)
test.Start()

# 问题：两个子事件如果标志一样就会被迫跑到前一个去执行