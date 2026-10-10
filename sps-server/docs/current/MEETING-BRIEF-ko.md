# SPS Meeting Brief

Last updated: 2026-07-30

## One-line Introduction

SPS is a Desktop platform that lets an individual or small team build and run
their own AI work environment from plugins, while keeping project files and
AI runtimes under the team's control.

## The Problem

AI tools are usually isolated chats or fixed project-management products.
Different teams need different work structures: game production, web and app
development, research, automation, or a custom internal process. A fixed
Task/Room/role model does not fit all of them.

## The SPS Approach

- The Host computer runs the team's SPS Server locally.
- The team works through a Windows Desktop application, with private
  Host/Member connection through Tailscale.
- The Core provides reliable technical foundations: computers, AI runtimes,
  project sources, runs, files, security, backup, updates, and plugins.
- Plugins define the team's actual way of working: roles, Tasks, Rooms,
  memory, approvals, and domain-specific tools.

## What Makes It Different

- **Local control:** the Host chooses project folders and Agent runtimes.
- **Flexible workflows:** game, web, app, and custom teams are not forced into
  one company structure.
- **AI-assisted customization:** users can tell an Assistant what environment
  they need, search for a plugin, or build their own.
- **Safe extension model:** an Assistant may recommend or create a plugin but
  cannot silently install it. The Host decides what becomes active.
- **Team-ready path:** Members can use permitted CLIs or local AI from their
  own computers, while the Host retains control of shared sources.

## Plugin Ecosystem

The first release has two paths:

1. **Official plugins:** reviewed and signed packages available from Settings
   > Plugins.
2. **Personal plugins:** a user builds and tests a private plugin with the
   SPS SDK, then uses it through a Local Development Registry without waiting
   for official review.

The initial marketplace is curated. Public uploads, payments, and sales are
deliberately postponed until package safety, compatibility, and review flows
are proven.

## Product Roadmap

- Finish a safe Host-to-new-Host Import flow.
- Add isolated Plugin Preview windows so a user can talk to an Assistant in
  SPS while viewing the plugin being built in a separate window.
- Turn Plugin Discovery & Builder into a practical personal-plugin authoring
  flow.
- Ship the first Official Marketplace inside Settings > Plugins.
- Validate the complete Host/Member flow on two real computers and release a
  signed Windows build with automatic updates.

## Short Demo Story

1. Create an SPS Workspace and register one Initial Assistant.
2. Ask for a game-development, web-development, or custom team environment.
3. Search existing plugins or have the Assistant help create one.
4. Preview the plugin in an isolated second window while keeping the SPS
   conversation open.
5. The Host explicitly activates the tested plugin for that Workspace.

## Honest Current State

The Windows Desktop and plugin foundation are implemented. Personal local
plugin staging and technical compatibility checks exist. Full Import,
isolated Preview, the marketplace UI, and final two-computer acceptance are
the major remaining release milestones.
