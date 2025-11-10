import os
import subprocess
import requests
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel
from rich.markdown import Markdown

# setup
load_dotenv()
API_KEY = os.getenv("DEEPSEEK_API_KEY")
if not API_KEY:
    raise ValueError("DEEPSEEK_API_KEY not found in .env")

DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"
console = Console()

SYSTEM_PROMPT = """
You are a coding assistant. 
- Be explicit, concise, and technical.
- If you want to propose a shell command, output it as:
#RUN:
<command>
"""

def deepseek_chat(messages):
    payload = {
        "model": "deepseek-chat",
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 800,
    }
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }
    r = requests.post(DEEPSEEK_URL, json=payload, headers=headers)
    if r.status_code != 200:
        console.print(f"[red]❌ {r.status_code}: {r.text}[/red]")
        return None
    return r.json()["choices"][0]["message"]["content"]

def display_message(role, text):
    color = {"user": "cyan", "assistant": "green"}.get(role, "white")
    if role == "assistant":
        console.print(Panel(Markdown(text), title="DeepSeek", border_style=color))
    else:
        console.print(f"[{color}]🧠 You:[/{color}] {text}")

def run_command_interactively(command):
    confirm = console.input(f"[yellow]Run this command?[/yellow] [dim]{command}[/dim] (y/n): ").lower()
    if confirm == "y":
        subprocess.run(command, shell=True)

def main():
    console.print("[bold magenta]🚀 DeepSeek Coding Agent Online[/bold magenta]\n")
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": "You are my coding agent. Acknowledge readiness."},
    ]

    reply = deepseek_chat(messages)
    if reply:
        display_message("assistant", reply)

    while True:
        user_input = console.input("[cyan]🧠 You: [/cyan]")
        if user_input.strip().lower() in ["exit", "quit", "bye"]:
            console.print("[magenta]👋 Goodbye[/magenta]")
            break

        messages.append({"role": "user", "content": user_input})
        reply = deepseek_chat(messages)
        if not reply:
            continue
        display_message("assistant", reply)

        # Look for #RUN: commands and offer to run them
        for line in reply.splitlines():
            if line.strip().startswith("#RUN:"):
                command = line.replace("#RUN:", "").strip()
                run_command_interactively(command)

if __name__ == "__main__":
    main()
