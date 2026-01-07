/**
 * Seed System Templates
 *
 * This script inserts the built-in system templates into the database.
 * Can be run during initial setup or to update system templates.
 *
 * Usage:
 *   npx tsx lib/templates/seed-templates.ts
 */

import { db } from "@/lib/db";
import {
  meetingTemplate,
  templateAgendaItem,
  templatePlanningQuestion,
} from "@/lib/db/schema";
import { SYSTEM_TEMPLATES, type SystemTemplateDefinition } from "./system-templates";
import { eq, inArray } from "drizzle-orm";

/**
 * Generate a unique ID for template items.
 */
function generateItemId(prefix: string, templateId: string, index: number): string {
  return `${prefix}-${templateId.replace("tpl-system-", "")}-${index}`;
}

/**
 * Seed a single system template with its agenda items and planning questions.
 */
async function seedTemplate(template: SystemTemplateDefinition): Promise<void> {
  // Insert or update the template
  await db
    .insert(meetingTemplate)
    .values({
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      scope: "system",
      teamId: null,
      createdBy: null,
      defaultDuration: template.defaultDuration,
      suggestedCadence: template.suggestedCadence,
      defaultGoal: template.defaultGoal,
      defaultSettings: template.defaultSettings,
      isArchived: false,
      usageCount: 0,
    })
    .onConflictDoUpdate({
      target: meetingTemplate.id,
      set: {
        name: template.name,
        description: template.description,
        category: template.category,
        defaultDuration: template.defaultDuration,
        suggestedCadence: template.suggestedCadence,
        defaultGoal: template.defaultGoal,
        defaultSettings: template.defaultSettings,
        updatedAt: new Date(),
      },
    });

  // Delete existing agenda items for this template (to handle updates)
  await db
    .delete(templateAgendaItem)
    .where(eq(templateAgendaItem.templateId, template.id));

  // Insert agenda items
  if (template.agendaItems.length > 0) {
    const agendaItemsToInsert = template.agendaItems.map((item, index) => ({
      id: generateItemId("tai", template.id, index),
      templateId: template.id,
      orderIndex: index,
      title: item.title,
      description: item.description || null,
      estimatedDuration: item.estimatedDuration,
      isRequired: item.isRequired ?? false,
      presenterRole: item.presenterRole || null,
    }));

    await db.insert(templateAgendaItem).values(agendaItemsToInsert);
  }

  // Delete existing planning questions for this template (to handle updates)
  await db
    .delete(templatePlanningQuestion)
    .where(eq(templatePlanningQuestion.templateId, template.id));

  // Insert planning questions
  if (template.planningQuestions.length > 0) {
    const questionsToInsert = template.planningQuestions.map((question, index) => ({
      id: generateItemId("tpq", template.id, index),
      templateId: template.id,
      orderIndex: index,
      question: question.question,
      category: question.category,
      isRequired: question.isRequired ?? false,
      placeholder: question.placeholder || null,
    }));

    await db.insert(templatePlanningQuestion).values(questionsToInsert);
  }
}

/**
 * Seed all system templates into the database.
 * Uses upsert to handle re-running safely.
 */
export async function seedSystemTemplates(): Promise<{
  seeded: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let seeded = 0;

  console.log(`Seeding ${SYSTEM_TEMPLATES.length} system templates...`);

  for (const template of SYSTEM_TEMPLATES) {
    try {
      await seedTemplate(template);
      seeded++;
      console.log(`  ✓ ${template.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to seed "${template.name}": ${message}`);
      console.error(`  ✗ ${template.name}: ${message}`);
    }
  }

  console.log(`\nSeeded ${seeded}/${SYSTEM_TEMPLATES.length} templates`);
  if (errors.length > 0) {
    console.error(`\nErrors:\n${errors.join("\n")}`);
  }

  return { seeded, errors };
}

/**
 * Clean up orphaned system templates that are no longer in the definitions.
 */
export async function cleanupOrphanedTemplates(): Promise<number> {
  const currentIds = SYSTEM_TEMPLATES.map((t) => t.id);

  // Find system templates not in the current definitions
  const orphaned = await db
    .select({ id: meetingTemplate.id })
    .from(meetingTemplate)
    .where(eq(meetingTemplate.scope, "system"));

  const orphanedIds = orphaned
    .map((t) => t.id)
    .filter((id) => !currentIds.includes(id));

  if (orphanedIds.length > 0) {
    await db
      .delete(meetingTemplate)
      .where(inArray(meetingTemplate.id, orphanedIds));
    console.log(`Cleaned up ${orphanedIds.length} orphaned system templates`);
  }

  return orphanedIds.length;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

// Run if executed directly
if (require.main === module) {
  seedSystemTemplates()
    .then(async (result) => {
      if (result.errors.length === 0) {
        // Also clean up any orphaned templates
        await cleanupOrphanedTemplates();
        console.log("\n✓ System templates seeded successfully");
        process.exit(0);
      } else {
        console.error("\n✗ Some templates failed to seed");
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}
