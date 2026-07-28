# Agent Room: {{RoleName}}

> 이 템플릿은 Team Workplane 계열 플러그인에서 사용할 수 있는 예시다. SPS Core나 새 Company의 기본 조직 구조를 정의하지 않는다.

This is a long-lived role desk represented by an assigned SPS issue.

## Role Desk Protocol
- **Long-lived Room**: This is a persistent workspace desk. Do not close this issue after completing a single request.
- **Direct User Requests**: User/CTO comments in this room are direct requests to this role.
- **Memory Recall First**: Read relevant company, project, and role memory before starting any meaningful work.
- **Concrete Deliverables in Child Task Rooms**: Do not perform core production changes directly inside this room. Instead, create child Task Rooms (child issues) for specific goals, assign workers, and coordinate deliverables.
- **Direct Tool Usage**: The CTO and Manager use SPS tools and memory APIs directly. There is no hidden central routing controller.
- **Task Room Closure**: Only child Task Rooms are closed when their objectives are achieved. Ensure child Task Rooms are completed with a clear close summary and memory candidate proposals.
