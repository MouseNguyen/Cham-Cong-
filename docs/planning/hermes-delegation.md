# Hermes delegation — deferred historical proposal

Duke approved native Codex subagents instead. See `codex-delegation.md`. This document and HD01–HD03 are retained as evidence; Hermes repair is outside the Pay Slip critical path. No Hermes execution is planned.

As of 2026-09-05. This file configures project task ownership, not the installed fleet. No agent was launched by PAY-REVIEW-01.

## Directly observed capability

Read-only inspection found six profile directories under C:/Users/ducng/AppData/Local/hermes/profiles. Atlas profile.yaml declares fleet atlas-team-v1 revision 1, manager=true, trust_state=draft. Installed source hermes-agent/hermes_cli/fleet_blueprints.py declares the role/model routes below. These are blueprint values; effective profile model overrides, credentials, provider availability and live delegation have not been verified in this review.

Installed tools/fleet_messaging.py exposes fleet_message with schema hermes.fleet.packet.v1 and routes to existing named profiles through background messaging. Managed fleet sessions reject generic delegate_task/message_agent calls. tools/fleet_mode.py provides a bounded Council sequence; it is unnecessary for ordinary tasks.

| Bot | Source blueprint | Project responsibility | Mutation |
|---|---|---|---|
| Atlas | gpt-5.6-sol / high | Manager: select one ready approved task, route to its named owner, collect evidence, report to Codex | No product writes or final acceptance |
| Forge | gpt-5.6-sol / high | Domain, database, application and UI implementation | Only current packet files |
| Scout | gpt-5.6-terra / high | Primary-source legal/technical research when separately authorized | Read-only; Codex persists accepted findings |
| Trace | gpt-5.6-sol / xhigh | Named failure diagnosis after bounded attempts fail | Read-only diagnosis until exact repair scope approved |
| Sentinel | gpt-5.5 / xhigh | Independent accuracy, evidence and boundary review | Read-only findings |
| Pulse | gpt-5.6-terra / high | Windows secrets, backup, lifecycle, operation tasks | Only approved operations packet files/actions |

Do not silently substitute native Codex workers or generic Hermes children for these bots. Do not enable every profile for every task. Use Atlas + one primary worker; call Sentinel once at a meaningful acceptance boundary. Forge/Pulse never write concurrently in the shared checkout. Independent Scout/Sentinel reads may overlap only when the confirmed roster explicitly permits it. Codex owns shared-file changes and final commits.

## Allocation and task readiness

The complete 20-task inventory and subpacket dependency graph are in task-status.json. Task numbers are stable work packages, not mandatory chronological waves. W7 secret groundwork and W6 outbox groundwork run early. W5 UI consumes commands only after those commands exist. M0 precedes the W1-04 part-time expansion.

Atlas receives only a confirmed roster revision and ready packets, not a blanket build-the-app instruction. It may split a listed task into steps inside its fixed owner/file/action/time boundary. A new task, model, worker, tool effect or ownership change goes to Codex. Existing specialists must not redelegate or spawn children. The project exception permits Atlas alone to send bounded fleet_message tasks to existing profiles listed in the approved roster; it does not create recursive fanout or grant new runtime permissions.

Each dispatch must carry task_id, owner, base commit, input hashes, objective, acceptance, exact owned_files, allowed actions/commands, excluded scope, approval reference, limits and receipt destination. fleet_message sends a compact summary plus a pointer to the project packet. Required tool arguments: target, kind=task, task_id, status=assigned, summary. objective, acceptance, evidence, blockers, next_action and risk carry the bounded context. Results use kind=result and complete/blocked/wrong_owner; complete is worker-reported only until Codex accepts it.

## Verification, stopping and efficiency

- One writer, one active task owner; queue dependent work. Workers cannot commit, install, start services, use real data, send messages externally or consume unlisted provider quota.
- Pin input commit/hashes before dispatch; if any owned input changes unexpectedly, stop and return stale_input. No edits outside the packet and no worktrees.
- First checkpoint 15 minutes; at most two attempts at one evidence layer. A second failure or any zero-delta attempt freezes that family. Trace diagnoses only if listed in the confirmed roster; otherwise report to Codex. One evidence-backed architectural fallback maximum.
- Sentinel reports only concrete core/accuracy/security/data-integrity blockers before M0. Optional cleanup goes to backlog. No repeated review/fix cycles for cosmetic issues.
- Return agent_id, task_id, status, summary, evidence, files_read, files_modified, verification, blocker and next_action. Read-only profiles return results through fleet_message; Codex writes durable project receipts.
- Codex checks actual diff, file ownership, direct test output and cleanup. Structure, synthetic runtime, live integration and production are separate states. Atlas does not mark task-status done based on a worker's prose.

## Dispatch blockers found in current source

The actual local target command in tools/bot_mode_dm.py (lines 363–375 at inspection) is hermes -p TARGET chat --in ~ -c "Bot Chat" --create-if-missing -Q. fleet_messaging.py forwards to this unchanged transport.

Three concrete blockers prevent claiming project-scoped automatic delegation:

1. The child explicitly starts in ~, not the packet repository. A prompt saying the project path does not change that process cwd.
2. The command continues the generic Bot Chat, so a project task may inherit unrelated context/history. This review did not open that private history.
3. The dispatch API/argv does not carry the packet's max-turns, restricted toolsets or job deadline to the target. The parent CLI limit is not a demonstrated child limit. Task text is advisory, not an enforced runtime contract.

Additional source behavior: writing a DM performs a stale-DM cache sweep; transport may retry once for selected failures. These side effects also need to be included in a future exact runtime approval. They are not authorized by this project-only review.

## Prepared next roster — not executable yet

PAY-HERMES-MANAGER-01.json records the blockers and a proposed Atlas -> Sentinel -> Atlas review. Atlas (Sol/high) coordinates; Sentinel (GPT-5.5/xhigh) reviews the corrected plans and rule boundary. Forge/Scout/Trace/Pulse remain unstarted. No new generic child agent is needed.

Before that roster can run, the existing Hermes dispatch must accept and validate a project job contract: canonical cwd, fresh task-bound session (resume only that task), named target/profile/model, tool allowlist, turn/deadline budget, bounded result route and exact process/temp cleanup. Preserve ordinary Bot Chat behavior for non-project messages. Do not patch the installed Hermes files in this Pay Slip task: it requires an explicit outside-repository repair packet and focused transport-test approval.

The installed executable is C:/Users/ducng/AppData/Local/hermes/hermes-agent/venv/Scripts/hermes.exe. The inspected parser supports profile selection, chat --in, --query-file, --oneshot, --model, --reasoning, --toolsets and --max-turns. That is enough for a project-bound parent invocation; it does not fix the child dispatch above. Therefore no launch command is represented as ready to execute until the transport correction is reviewed and validated.

After the repair, verify only allowlisted effective model/effort/provider fields and exact input hashes, then confirm the visible roster revision. Do not read .env/auth stores/tokens/cookies/databases/private histories or silently substitute models. Existing provider auth remains runtime-owned; missing auth stops the task. Codex owns final diff/test/cleanup acceptance.
