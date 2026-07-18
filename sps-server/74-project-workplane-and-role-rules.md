# Project Workplane And Agent Instructions

## Purpose

Keep long-lived Agent Rooms distinct from finite Worker Tasks in the project
UI, and use SPS's own Agent Instructions as the only editable source of
Agent operating rules.

## Project UI

`local.room-chat` version `0.2.0` separates the user-facing Project and Task
surfaces without patching SPS core.

- `Agent Rooms` lists one unassigned root issue per hired Agent. Its title is
  exactly the Agent name and its plugin origin stores that Agent ID.
- Project `Workplane` contains Agent Rooms and links to that Project's Tasks;
  it does not render Task rows.
- The company route `/<company>/tasks` is the Project Task Board. It opens as
  a Project picker and loads no Task rows until the user selects one Project.
  It then includes only that Project's finite issues, never an Agent Room
  issues, and identifies the owning Room for child Tasks.
- Each Project receives a `Rooms` sidebar link to its Workplane.
- The native `/issues` screen remains the upstream all-issue screen. It is not
  the operating Task Board, which preserves SPS upgrade compatibility.

Agent Rooms are created as `todo`, which means available for their custom Room
runtime. They are deliberately unassigned, so this status does not wake a
managed SPS agent. An Agent Room is created for every hired Agent when a
Project is created, and for every existing Project when an Agent is hired.
Agent rename events keep Room titles synchronized. Earlier role-based Rooms
are cancelled but retained as history.

## Role Rules

Each hired Agent owns a managed `AGENTS.md` in SPS's Agent Instructions
surface. There is no separate Role AGENTS.md page and no duplicate rule store.
The plugin resolves the Room's Agent ID, reads that Agent's current managed
file, and injects it as the Codex developer instruction on every new or
resumed Room thread.

Project-specific design, implementation, and workflow constraints remain in
their repositories and reach an Agent Room only through an explicit design
reference, Task contract, or user decision. No repository `AGENTS.md` is used
as SPS Room memory or Agent configuration.
