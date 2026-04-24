## Task Tool Usage Policy
  - ALWAYS use the Task tool for codebase exploration instead of direct Grep/Glob commands
  - ALWAYS use the Task tool for multi-step research and analysis
  - ALWAYS use specialized agents proactively when the task matches their description
  - Do NOT ask permission before launching agents - execute immediately when relevant

  ### Common Task Patterns:
  - "Where is X handled?" → Task (Explore agent, medium thoroughness)
  - "How does Y work?" → Task (Explore agent, very thorough)
  - "What's the codebase structure?" → Task (Explore agent, quick)
  - "Fix test failures" → Task (rspec-flaky-agent for RSpec)
  - "Build static site" → Task (static-site-agent)
  - "Review this code" → Task (code-reviewer agent)
  - "Design this feature" → Task (code-architect agent)

  ## Proactive Agent Execution
  Launch the Task tool IMMEDIATELY (without asking) when user requests involve:

  **Code Exploration:**
  - Keywords: "where", "how does", "find", "understand", "explain", "show me"
  - Example: "Where are API routes defined?" → Immediately use Task (Explore)

  **Code Review:**
  - Keywords: "review", "check", "audit", "analyze", "look for issues"
  - Example: "Review the auth code" → Immediately use Task (code-reviewer)

  **Testing & Debugging:**
  - Keywords: "fix tests", "diagnose failures", "why is test failing"
  - Example: "Fix flaky RSpec tests" → Immediately use Task (rspec-flaky-agent)

  **Feature Development:**
  - Keywords: "implement", "add feature", "build", "create"
  - Example: "Add dark mode" → Immediately use EnterPlanMode or Task (feature-dev)

  **Static Website Projects:**
  - Keywords: "create website", "build landing page", "make site for"
  - Example: "Build a restaurant website" → Immediately use Task (static-site-agent)

  ### Execution Rules:
  - Launch agents in parallel when tasks are independent
  - Never announce "I'm going to use an agent" - just use it
  - Only ask clarifying questions if requirements are genuinely ambiguous
  - Prefer action over discussion

## Token Economy Policy
Minimize token usage while maintaining effectiveness:

### Default to Task Tool (Primary Strategy):
- **Use Task tool FIRST** for any multi-step operation, exploration, or research
- Launch agents with `model: "sonnet"` (default) for complex reasoning, architecture, multi-file changes
- Never use Opus unless extremely complex reasoning required
- Agents are MORE efficient than direct tool usage for exploratory work
- Only use direct Read/Grep/Glob when you need a single, specific piece of information

### Read Operations (When NOT using Task):
- Never read files you've already read in the current session unless they've been modified
- Use targeted Grep with specific patterns instead of reading entire files
- Read only the specific sections needed (use offset/limit parameters for large files)
- Avoid reading generated files (node_modules, build artifacts, minified code)

### Agent Selection Guide:
- Simple file search, basic code review → Task (Explore/code-reviewer, model: "haiku")
- Understanding how feature works → Task (Explore, model: "sonnet")
- Multi-file refactoring → Task (feature-dev, model: "haiku" or "sonnet" based on complexity)
- Architecture decisions → Task (code-architect, model: "sonnet")
- Testing issues → Task (rspec-flaky-agent, model: "sonnet")

### Search Strategy:
- Use Glob for file path searches (fastest, cheapest)
- Use Grep with `output_mode: "files_with_matches"` to find locations before reading
- Use Grep with `head_limit` to cap results on broad searches
- Prefer specific patterns over broad wildcards

### File Operations:
- Use Edit tool instead of Read + Write for modifications
- Batch independent operations in parallel tool calls
- Never read files just to "check" - read with purpose

### Communication:
- Keep responses concise and focused
- Don't repeat code unnecessarily - reference with file:line instead
- Avoid verbose explanations when code/actions speak for themselves

**Target: Minimize tokens per task while maximizing value delivered**