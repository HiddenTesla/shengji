
### 本naming convention仅针对远程服务上分支，本地分支可以随意
#### 本convention自2017年11月22日开始执行

* `dev/TASK-[0-9]+.*`

准备合入develop分支的某个TASK。TASK指开发阶段中的某个必经之路，会影响甚至阻塞后续TASK的开发。

此类分支应已完成其描述的task任务，并且不应有大bug。

* `dev/SUB-[0-9]+.*`

准备合入develop分支的某个SUB。SUB指对已有代码的某些小改进，一般而言不会影响后续TASK或SUB的开发。

* `draft/.*`

任何尝试性改动，不应合入develop分支。允许有未完成的task以及大bug。

* `develop`

汇总开发的分支，不允许push，仅能由dev/.\*合入

* `master`

暂不使用