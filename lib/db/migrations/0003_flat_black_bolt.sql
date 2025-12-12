CREATE TABLE "agenda" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"created_by" text NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"current_item_index" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"meeting_started_at" timestamp,
	"meeting_ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agenda_room_id_unique" UNIQUE("room_id")
);
--> statement-breakpoint
CREATE TABLE "agenda_item" (
	"id" text PRIMARY KEY NOT NULL,
	"agenda_id" text NOT NULL,
	"order_index" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"estimated_duration" integer,
	"presenter" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"actual_duration" integer,
	"start_transcript_ref" text,
	"end_transcript_ref" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agenda" ADD CONSTRAINT "agenda_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_item" ADD CONSTRAINT "agenda_item_agenda_id_agenda_id_fk" FOREIGN KEY ("agenda_id") REFERENCES "public"."agenda"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agenda_room" ON "agenda" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "idx_agenda_item_agenda" ON "agenda_item" USING btree ("agenda_id");--> statement-breakpoint
CREATE INDEX "idx_agenda_item_order" ON "agenda_item" USING btree ("agenda_id","order_index");