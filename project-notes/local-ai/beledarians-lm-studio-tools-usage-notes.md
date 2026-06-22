# Beledarian LM Studio Tools — Recommended Settings (beledarians-lm-studio-tools)

## Plugin Settings

```text
Message Language: en
UI Language Override: auto
Plan Mode: when_useful

Default Workspace Path:
C:\Workspaces\ancient-egypt-and-the-bible

Allow JavaScript Execution: On
Allow Python Execution: On
Allow Terminal Execution: On
Allow Shell Command Execution: On
Allow Browser Control: On
Allow Git Operations: On
Allow GitHub CLI Tools: Off
Allow Database Inspection: On
Allow System Notifications: Off
Allow All Code Execution: Off

Enable Memory: Off
Enable Wikipedia Tool: On
Enable Local RAG: Off
Enable Secondary Agent/Model: Off
```

`Enable Local RAG` is off because `jray/big-rag` already provides project retrieval.

The execution and browser switches are on only so the corresponding tools are available. Their individual LM Studio permissions remain **Ask**.

## Protected Paths

Suggested starting list:

```text
C:\Windows
C:\Program Files
C:\Program Files (x86)
C:\Users\JR\.ssh
C:\Users\JR\AppData
C:\Workspaces\LMStudioData
```

Protected paths are only an additional safeguard. They are not a complete security boundary for shell commands.

---

# LM Studio Tools Checklist

## Enable + Allow

These are primarily read-only or low-impact inspection tools.

```text
list_directory
read_file
read_document
search_file_content
find_files
fuzzy_find_local_files
get_file_metadata

git_status
git_diff
git_log
git_show

web_search
wikipedia_search
fetch_web_content
rag_web_content

get_system_info
```

## Enable + Ask

These write files, change state, execute code, expose private data, launch applications, or automate a browser.

```text
change_directory
make_directory
save_file
replace_text_in_file
move_file
copy_file
delete_path
delete_files_by_pattern

git_add
git_commit
git_checkout

analyze_project
query_database
run_test_command

run_javascript
run_python
execute_command
run_in_terminal

browser_open_page
browser_session_open
browser_session_control
browser_session_close

read_clipboard
write_clipboard
open_file
preview_html
```

## Disable

```text
git_push
rag_local_files
save_memory
send_notification
consult_secondary_agent
```

Reasons:

* `git_push`: keep remote publication under direct manual control.
* `rag_local_files`: redundant with the installed Big RAG fork.
* `save_memory`: avoids uncontrolled creation or modification of `memory.md`.
* `send_notification`: unnecessary for the transcript workflow.
* `consult_secondary_agent`: leave disabled until a secondary model and its permissions are deliberately configured.

## Optional Later Settings

When intentionally testing secondary agents:

```text
Enable Secondary Agent/Model: On
Sub-Agent Frequency: hard_tasks
Sub-Agent: Allow File System: On
Sub-Agent: Allow Web Search: On
Sub-Agent: Allow Code Execution: Off initially
Sub-Agent: Allow Browser Control: Off initially
Enable Auto-Debug Mode: Off
Enable Sub-Agent Debug Logging: Off
Sub-Agent Auto-Save Code: Off initially
Show Full Code Output: On
```

Set `consult_secondary_agent` to **Enable + Ask** only after those settings are configured.

Browser automation for a sub-agent requires all three of these:

```text
Allow Browser Control: On
Sub-Agent: Allow Web Search: On
Sub-Agent: Allow Browser Control: On
```

## Permission Rule

```text
Allow = read-only inspection or ordinary web retrieval
Ask  = writes, execution, state changes, private data, or external actions
Disable = redundant, unnecessary, or too risky for routine use
```
