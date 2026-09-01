Published: June 9, 2026, Last updated: July 1, 2026

<br />

| Explainer | Web | Extensions | Chrome Status | Intent |
|---|---|---|---|---|
| [GitHub](https://github.com/webmachinelearning/webmcp) | [![Origin trial](https://developer.chrome.com/static/images/experiment.svg) Origin trial](https://developer.chrome.com/origintrials/#/register_trial/4163014905550602241) |   | [View](https://chromestatus.com/feature/5117755740913664) | [Intent to Experiment](https://groups.google.com/a/chromium.org/g/blink-dev/c/gmYffo5WOE8/m/OJxuQRP3AAAJ) |

You can use the Web Model Context Protocol ([WebMCP](https://developer.chrome.com/docs/ai/webmcp)) to build
and expose structured tools to AI agents running within the browser, including
agents powered by extensions. An [agent](https://web.dev/articles/ai-agents)
uses a large language model (LLM), rules, memory, and tools to execute actions
on behalf of the user.

As LLMs treat all text, instructions, and user data as a single sequence of
tokens, they're susceptible to *indirect prompt injection*, an inclusion of
malicious instructions by an attacker. Our team has written this document on
tool security, to help you protect your website and your users from bad actors.

While some models have layers that address prompt injection, it's impossible to
guarantee safety inside of a large language model (LLM). Models are
probabilistic in nature. It's important to remember that there have been
[repeatable prompt injection attacks](https://bughunters.google.com/blog/task-injection-exploiting-agency-of-autonomous-ai-agents)
against agentic systems that use state-of-the-art LLMs, and the
[prevalence of attacks on the web](https://blog.google/security/prompt-injections-web/)
is increasing.

To address these concerns, we've provided preliminary guidance on security for
those building tools with WebMCP.

## Use annotation hints

There are a few hints you should add when building your tools:

- **Use `untrustedContentHint` where appropriate** . If a tool returns user-generated content (UGC) or externally sourced data, consider adding the `untrustedContentHint` to the tool. This field explicitly labels the payload as untrusted, to help protect your site's integrity while providing a signal to the agent that this data requires heightened scrutiny.
- **Use the `readOnlyHint` on tools that don't change state.** This allows the agent to make better decisions about when to ask for user confirmations.

## Expose your tools carefully

The WebMCP `document.modelContext.registerTool` API only exposes the tool's
functionality to agents. By default, other websites or cross-origin iframes
can't observe or interact with your tools.

You can provide access to your tool with the
[`exposedTo`](https://developer.chrome.com/docs/ai/webmcp/imperative-api#origin_exposure) option in
`registerTool` to an array of specific, secure origins. This exposes your tool
to those origins when embedded on your site, and when your site is embedded on
that origin.

    // https://partner.org

    await document.modelContext.registerTool({
      name: 'my_shared_tool',
      description: 'Shared across origins',
      // ...
    }, {
      exposedTo: ['https://trusted.com', 'https://example.com']
    });

Only [expose](https://developer.chrome.com/docs/ai/webmcp/imperative-api#origin-exposure%20) your tools to
origins that you trust. This is particularly important when tools manage user
data or otherwise impact the user.

- A read-only tool, such as `getFavoriteProducts`, can reveal information about a user. You should only expose these tools to websites you would directly share this data with otherwise.
- Tools with read and write access take action on behalf of a user. These tools should only be exposed to origins you decide can be trusted when acting on behalf of your user. For example, you may want to expose `postComment` to `trustedExample.com`, but you wouldn't want to expose it to `evilExample.com`.

> [!NOTE]
> **Note:** Chrome Extensions can query and execute WebMCP tools using content scripts. With `host_permission`, those extensions can manipulate the page by running custom JavaScript, even without WebMCP.

## Set character budgets

To avoid running into agent guardrails, write succinct tool descriptions and outputs. We recommend the following character limits for better results:

- 500 characters per tool description
- 150 characters per parameter description
- 30 characters per tool name and parameter name
- 1.5K character limit per individual tool output

It's likely that there is some variation across agents, and you may want to adjust your character budgets with user feedback.

> [!NOTE]
> **Note:** These recommendations are subject to change, as a result of ecosystem feedback. Specific character limitations may be added to the API specification in the future. [Share your feedback](https://developer.chrome.com/docs/ai/webmcp/secure-tools#next_steps).

## Next steps

We're continuing to research and work on building a secure infrastructure for
the agentic web. For example, there is an ongoing
[discussion about consent management](https://github.com/webmachinelearning/webmcp/issues/176%20)
across parties, and the spec draft includes
[`requestUserInteraction()`](https://webmachinelearning.github.io/webmcp/#model-context-client)
to asynchronously request user input at tool execution.

How do you plan on implementing WebMCP in your application? Do you have other
concerns, security or otherwise? If you sign up for the WebMCP origin trial,
we want to know about your experience:

- Share your feedback on the API shape by commenting on an existing issue or opening a new one in the [WebMCP explainer on GitHub](https://github.com/webmachinelearning/webmcp?tab=readme-ov-file).
- If you have feedback on Chrome's implementation, file a [Chromium bug](https://crbug.com/new?component=2021259).
- [Join the early preview program](http://goo.gle/chrome-ai-dev-preview-join) for an early look at new APIs and access to our mailing list.
- Review the implementation for Chrome on [Chrome Status](https://chromestatus.com/feature/5117755740913664).

If you're building an agent, we recommend you read
[Agent security considerations for WebMCP](https://developer.chrome.com/docs/agents/security).