import { defineEnv } from "@tools/workspace-env"

export const env = defineEnv((z) => ({
  __WORKSPACE_ENV_PLACEHOLDER_VAR_FROM_ROOT_DIR__: z.string().default("hello from root dir"),
}))

export default env
