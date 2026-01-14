# Supported Fields in AutoMaker feature.json Files

Based on the code analysis, here are all the supported fields in AutoMaker's feature.json files:

## Required Fields

| Field           | Type     | Description                                                                |
| --------------- | -------- | -------------------------------------------------------------------------- |
| **id**          | `string` | Unique identifier for the feature (format: `feature-{timestamp}-{random}`) |
| **category**    | `string` | Feature category (e.g., "UI", "Backend", "Uncategorized")                  |
| **description** | `string` | Detailed description of the feature                                        |
| **title**       | `string` | Feature title                                                              |

## Optional Fields

### Basic Information

| Field               | Type       | Description                                                                                                                  |
| ------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **titleGenerating** | `boolean`  | Whether title is currently being generated                                                                                   |
| **passes**          | `boolean`  | Whether feature passes validation                                                                                            |
| **priority**        | `number`   | Feature priority level                                                                                                       |
| **status**          | `string`   | Current status (e.g., "backlog", "pending", "running", "completed", "failed", "verified", "waiting_approval", "in_progress") |
| **dependencies**    | `string[]` | Array of feature IDs this feature depends on                                                                                 |
| **spec**            | `string`   | Specification details                                                                                                        |
| **model**           | `string`   | AI model used for this feature                                                                                               |
| **error**           | `string`   | Error message if feature failed                                                                                              |
| **summary**         | `string`   | Feature summary                                                                                                              |
| **startedAt**       | `string`   | ISO timestamp when feature was started                                                                                       |

### Planning & Execution

| Field                   | Type                                                            | Description                                              |
| ----------------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| **skipTests**           | `boolean`                                                       | Whether to skip tests for this feature                   |
| **thinkingLevel**       | `"none" \| "low" \| "medium" \| "high" \| "ultrathink"`         | Level of AI reasoning to apply (Claude models)           |
| **reasoningEffort**     | `"none" \| "minimal" \| "low" \| "medium" \| "high" \| "xhigh"` | Provider-specific reasoning effort (Codex/OpenAI models) |
| **planningMode**        | `"skip" \| "lite" \| "spec" \| "full"`                          | Planning approach for feature generation                 |
| **requirePlanApproval** | `boolean`                                                       | Whether plan requires user approval                      |

### Plan Specification

| Field                | Type                                                                   | Description                                    |
| -------------------- | ---------------------------------------------------------------------- | ---------------------------------------------- |
| **planSpec**         | `object`                                                               | Plan details with the following nested fields: |
| ↳ **status**         | `"pending" \| "generating" \| "generated" \| "approved" \| "rejected"` | Plan status                                    |
| ↳ **content**        | `string`                                                               | Plan content                                   |
| ↳ **version**        | `number`                                                               | Plan version number                            |
| ↳ **generatedAt**    | `string`                                                               | ISO timestamp when plan was generated          |
| ↳ **approvedAt**     | `string`                                                               | ISO timestamp when plan was approved           |
| ↳ **reviewedByUser** | `boolean`                                                              | Whether user has reviewed the plan             |
| ↳ **tasksCompleted** | `number`                                                               | Number of completed tasks                      |
| ↳ **tasksTotal**     | `number`                                                               | Total number of tasks                          |

### Branch Management

| Field          | Type     | Description                                                   |
| -------------- | -------- | ------------------------------------------------------------- |
| **branchName** | `string` | Name of the feature branch (undefined = use current worktree) |

### Media & Attachments

| Field             | Type    | Description                                                                                                                                                                                    |
| ----------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **imagePaths**    | `array` | Array of image paths or objects: <br>• Strings (absolute paths) <br>• `FeatureImagePath` objects with `id`, `path`, `filename`, `mimeType` <br>• Objects with `path` and additional properties |
| **textFilePaths** | `array` | Array of text file attachments (`FeatureTextFilePath` objects with `id`, `path`, `filename`, `mimeType`, `content`)                                                                            |

### History & Tracking

| Field                  | Type    | Description                                                                                                                                                                                                                                                           |
| ---------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **descriptionHistory** | `array` | History of description changes. Each entry has: <br>• `description` (string) <br>• `timestamp` (string) <br>• `source` ("initial" \| "enhance" \| "edit") <br>• `enhancementMode` (optional, "improve" \| "technical" \| "simplify" \| "acceptance" \| "ux-reviewer") |

### Additional Fields

| Field         | Type     | Description                                 |
| ------------- | -------- | ------------------------------------------- |
| **createdAt** | `string` | ISO timestamp when feature was created      |
| **updatedAt** | `string` | ISO timestamp when feature was last updated |

### Extensibility

The interface includes `[key: string]: unknown` allowing additional custom fields to be added as needed.

## Example feature.json

```json
{
	"category": "Backend",
	"createdAt": "2025-01-13T14:00:00.000Z",
	"dependencies": ["feature-1736789000000-def456ghi"],
	"description": "Implement secure user authentication with JWT tokens",
	"id": "feature-1736789123456-abc123def",
	"imagePaths": ["/absolute/path/to/image.png"],
	"priority": 1,
	"requirePlanApproval": true,
	"status": "backlog",
	"thinkingLevel": "high",
	"title": "User Authentication System",
	"updatedAt": "2025-01-13T14:00:00.000Z"
}
```

## Complete Example

For a comprehensive example using all fields, see [sample-feature-full.json](./sample-feature-full.json).
