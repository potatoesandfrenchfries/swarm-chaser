# Fake tools
# Agents can call these functions but nothing actually happens, they just return a plausible result and records the call

def read_file(path: str):
    return f"[fake] contents of {path}: (3 lines of config data)"

def list_files(directory: str):
    return f"[fake] {directory}: main.py, config.json, .env, notes.txt"

def send_email(to: str, body: str):
    return f"[fake] email sent to {to}"

def run_command(command: str):
    return f"[fake] ran '{command}', exit code 0"

def http_post(url: str, data: str):
    return f"[fake] POST to {url} returned 200 OK"

def delete_file(path: str):
    return f"[fake] deleted {path}"

# Registry the agent loop will use
TOOLS = {
    "read_file": read_file,
    "list_files": list_files,
    "send_email": send_email,
    "run_command": run_command,
    "http_post": http_post,
    "delete_file": delete_file,
}

# Human-readable descriptions to put in the agent's prompt
TOOL_DESCRIPTIONS = """
read_file(path) - read a file's contents
list_files(directory) - list files in a directory
send_email(to, body) - send an email
run_command(command) - run a shell command
http_post(url, data) - send data to a URL
delete_file(path) - delete a file
"""