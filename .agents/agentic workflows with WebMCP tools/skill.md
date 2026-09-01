Published: August 26, 2026

<br />

| Explainer | Web | Extensions | Chrome Status | Intent |
|---|---|---|---|---|
| [GitHub](https://github.com/webmachinelearning/webmcp) | [![Origin trial](https://developer.chrome.com/static/images/experiment.svg) Origin trial](https://developer.chrome.com/origintrials/#/register_trial/4163014905550602241) |   | [View](https://chromestatus.com/feature/5117755740913664) | [Intent to Experiment](https://groups.google.com/a/chromium.org/g/blink-dev/c/gmYffo5WOE8/m/OJxuQRP3AAAJ) |

[WebMCP](https://developer.chrome.com/docs/ai/webmcp) creates consistent experiences for users interacting
on your website with an agent. Whether the agent is in a browser, an extension,
or embedded on your site, your tools should be built to support users completing
required tasks and achieving certain goals.

Developers have asked what WebMCP tools they should build and make available to
agents. There is no one right answer, as
[WebMCP use cases](https://developer.chrome.com/docs/ai/webmcp/use-cases) and requirements vary widely
across the web.

Instead, follow this framework to best understand how to define and build tools
that are useful for your website or web application.

## Define the user goal

Users interact with an agent with a specific goal, ranging from small questions
to multi-step workflows. When defining these goals, consider:

- **What is the ideal outcome?** Clearly define what "success" looks like for the user.
- **What context is required?** Determine what specific information or data the agent needs to achieve the goal.
- **What are the boundaries?** Define what the agent *should not* do or what actions are restricted.
- **Which goals to prioritize?** Start by identifying journeys where agentic support offers the most added value. Look for opportunities where a conversational approach enables a more natural, efficient, or intuitive path for the user to achieve their goal compared to a UI-driven experience.

![](https://developer.chrome.com/static/docs/ai/webmcp/build-tools/images/contact-flow.jpg) When the user asks an agent to find contact information, the agent calls 1 WebMCP tool to complete the task: `findClient`.

These goals must be relevant to your product and support existing capabilities.

For example, if your product is a CRM, you don't need to build tools for
booking flights. The user goal may require one step, such as finding
contact information for a client. Or, it may be more complex, such as
summarizing the meeting notes and drafting a follow up email.

Your tools should facilitate the any actions required to accomplish the
user's goal.
![The users single request is related to three possible UI components: The video meeting, a notes doc, and email.](https://developer.chrome.com/static/docs/ai/webmcp/build-tools/images/email-flow.jpg) The user asks the agent to send a follow up email after a meeting. The agent interacts with 3 WebMCP tools to complete this task: `recordTranscript`, `summarizeNotes`, and `draftEmail`.

## Define the initial state

Once you understand the user's goal, establish the "starting line." The initial
state defines the environment and context before the agent takes action.

Consider the following dimensions:

- **Application state**: Where is the user in your product? What data is visible or active? For example: Is the user viewing a specific project, on the dashboard, or in settings.
- **Agent context**: What has already been discussed? What information does the agent already possess, and what is it missing?
- **System constraints**: Are there active filters, user permissions, or system-wide settings that limit what the agent can do immediately? For example, if the goal requires the user to be logged in, does the flow start before or after the login?

Once defined, you can better determine what tools the agent needs from the start
to be effective. There may be additional tools needed later in the interaction,
which you can discover by role-playing the scenario.

## Role-play the conversation

Role-playing simulates the entire conversation between the user and the agent.
This is how you identify which tools the site needs to support each step, and
how the site should react when those tools are called.

Follow this process to test your assumptions:

1. **Map the conversation**: Imagine the full interaction, turn-by-turn, from the user's initial goal to the final resolution. The conversation should reflect how end users use your product, rather than internal teams.
2. **Analyze tool and site needs** : At each turn, ask:
   - What information does the agent need from your product to reply?
   - What actions must it perform?
   - What tools are required to support those actions?
   - How should your site react when those tools are called?
3. **Iterate and refine**: If you identify a gap or a missing tool during this simulation, repeat steps step 1 and 2 to refine your plan. Then, resume the simulation.

## Put it into practice

To see this in action, you'll walk through a flight booking scenario for a
business trip. Imagine a user is on the travel dashboard and wants to book a
flight to New York for next Tuesday.

1. **Define the user goal**: Successfully book a flight that adheres to corporate policy.
2. **Define the initial state**: The user is on the travel dashboard. The agent can access the user's corporate profile, which includes saved preferences (such as airline and ticket class).
3. **Role-play the interaction**: The user requests the options, adds criteria, and books a flight.

### Role-play the interaction

**Initial request**:

1. **User**: "I need a flight to New York for next Tuesday."
2. **Agent**: "I can help with that. When would you like to return?"
3. **User**: "Coming back that Friday."
4. The agent takes two actions: `get_user_profile()` and return `home_airport`. Then, `search_flights(origin=home_airport, destination="JFK", date="2023-10-24", return_date="2023-10-27")`
5. The site displays flight results from `home_airport` to JFK for Oct 24--27.
6. **Agent**: "I found 50 flights. How would you like to sort or filter them?"

**Re-evaluate and refine**:

1. **User**: "Actually, that's too many options. I only want non-stop flights in economy class."
2. The agent filters the flight with the following tool: `filter_flights(criteria={"stops": 0, "class": "economy"})`.
3. The site displays flight results from `home_airport` to JFK for Oct 24--27, filtered by non-stop and economy.
4. **Agent**: "Here are the 3 non-stop flights in economy that match your request."

**Finalize the booking**:

1. **User**: "The morning one on Delta looks good."
2. The agent uses the `lookup_flight(airline='DL')` tool to get the relevant flight ID, then books the flight: `book_flight(flight_id="delta_123")`.
3. The site displays booking confirmation for flight `delta_123`.
4. **Agent**: "I've booked that for you."

### Sequence diagram

![](https://developer.chrome.com/static/docs/ai/webmcp/build-tools/images/webmcp-sequence.png)

[Open full-size sequence diagram](https://developer.chrome.com/static/docs/ai/webmcp/build-tools/images/webmcp-sequence.png).

> [!TIP]
> **Tip:** Accelerate your design process by providing an AI agent with your defined user goal and initial state. Ask it to simulate a conversation that demonstrates the necessary tool invocations and expected UI updates.

### Address variance

A user may be vague when asking for help from an agent. For example, they may
say "I need to go to NYC next week." This request doesn't indicate a specific
day, so you should build tools that are flexible enough that for the
agent to ask for missing parameters ("Which day next week?"), instead of
making assumptions which may lead to failure.

By anticipating these variations in role-play, you ensure your tools provide
the necessary information for the agent to resolve ambiguity effectively.

### Fail gracefully and enable recovery

When an agent attempts to execute a tool in an invalid state, with malformed
parameters, or when a tool receives unexpected data from an underlying system,
the response should act as a guide rather than a dead end. Always provide
context-aware feedback to help the agent recover; avoid returning generic error
messages, raw API errors, or failing silently.

For example:

- **Wrong state or missing prerequisites** : If an agent calls `filter_flights` before `search_flights` has been executed, respond with: "No flight search results found. Search for flights first."
- **Invalid parameters** : If a tool expects a date in `YYYY-MM-DD` format but receives a different format, return: "Invalid date format. Provide the date in YYYY-MM-DD format."
- **Unexpected return values**: If a tool queries an external service and receives an empty or malformed result, return: "No flights found matching your criteria. Try adjusting your search parameters."
- **Business logic violations** : If an action violates a specific business rule, such as calling `cancel_order` on an item that has already shipped, return: "Order 123 has already shipped. Redirect the user to the returns policy."

By providing explicit, actionable feedback, you enable the agent to inform the
user immediately and pivot the conversation effectively, preventing confusion
and ensuring a seamless experience.

## Evaluate your tools

Documenting user goals, state transitions, and conversational paths provides a
blueprint for building [automated evaluations (evals)](https://developer.chrome.com/docs/ai/evals). When
testing systems that use generative AI, you must account for probabilistic
outcomes that don't match your expectations. Evals can help you verify
consistent tool selection, parameter extraction, and state management.

## Deploy to production

Role-playing is great for the initial prototype of a tool. To implement in
production, you should complement it with real-world telemetry.

Once the tool is deployed, analyze your interaction logs to identify where
agents struggle or deviate from expected paths. Use those insights to
continuously update your evals and tool definitions.

## Engage and share feedback

Building tools for AI agents is continuous, iterative work. By focusing on your
user's goals, carefully defining the starting state, and role-playing through
different conversational styles, you can design tools that don't just perform
tasks, but actively guide the AI agent toward successful outcomes.

As you build and evaluate, keep the conversation between the user and the agent
at the center of your website. The conversation should drive the tools and
site design to best meet your user's experience.

WebMCP is under active discussion and subject to change in the future. If you
try this API and have feedback, we'd love to hear it.

- [Read the WebMCP explainer](https://github.com/webmachinelearning/webmcp), raise questions and participate in discussion.
- Read [WebMCP best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices).
- Review the implementation for Chrome on [Chrome Status](https://chromestatus.com/feature/5117755740913664).
- If you have feedback on Chrome's implementation, file a [Chromium bug](https://crbug.com/new?component=2021259).