// The Flue Vite plugin turns an imported SKILL.md into a skill reference for useSkill().
declare module "*.md" {
  import type { SkillReference } from "@flue/runtime";
  const skill: SkillReference;
  export default skill;
}
