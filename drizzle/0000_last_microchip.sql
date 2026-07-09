CREATE TABLE `client` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `campaign` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`data_origin` text NOT NULL,
	`is_demo` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `client`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `creator` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `deliverable` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`creator_id` text NOT NULL,
	`type` text NOT NULL,
	`claimed_status` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creator_id`) REFERENCES `creator`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `claim` (
	`id` text PRIMARY KEY NOT NULL,
	`deliverable_id` text NOT NULL,
	FOREIGN KEY (`deliverable_id`) REFERENCES `deliverable`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `claim_deliverable_id_unique` ON `claim` (`deliverable_id`);--> statement-breakpoint
CREATE TABLE `proof_requirement` (
	`id` text PRIMARY KEY NOT NULL,
	`deliverable_id` text NOT NULL,
	`kind` text NOT NULL,
	`criticality` text NOT NULL,
	FOREIGN KEY (`deliverable_id`) REFERENCES `deliverable`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `evidence_item` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`type` text NOT NULL,
	`machine_or_human` text NOT NULL,
	`data_origin` text NOT NULL,
	`uploaded_at` text NOT NULL,
	`client_captured_at` text,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `evidence_link` (
	`id` text PRIMARY KEY NOT NULL,
	`evidence_item_id` text NOT NULL,
	`proof_requirement_id` text NOT NULL,
	`source` text NOT NULL,
	`data_origin` text NOT NULL,
	FOREIGN KEY (`evidence_item_id`) REFERENCES `evidence_item`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proof_requirement_id`) REFERENCES `proof_requirement`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `match_suggestion` (
	`id` text PRIMARY KEY NOT NULL,
	`evidence_item_id` text NOT NULL,
	`proof_requirement_id` text NOT NULL,
	FOREIGN KEY (`evidence_item_id`) REFERENCES `evidence_item`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proof_requirement_id`) REFERENCES `proof_requirement`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `human_confirmation` (
	`id` text PRIMARY KEY NOT NULL,
	`evidence_link_id` text NOT NULL,
	`proof_requirement_id` text NOT NULL,
	`confirmed_by` text NOT NULL,
	`confirmed_at` text NOT NULL,
	`machine_or_human` text DEFAULT 'human' NOT NULL,
	`data_origin` text NOT NULL,
	FOREIGN KEY (`evidence_link_id`) REFERENCES `evidence_link`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proof_requirement_id`) REFERENCES `proof_requirement`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_result` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`machine_verdict` text NOT NULL,
	`trace` text NOT NULL,
	`snapshot_version` integer NOT NULL,
	`ruleset_version` text NOT NULL,
	`campaign_override_hash` text NOT NULL,
	`evidence_snapshot_hash` text NOT NULL,
	`data_origin` text NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claim`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `caveat` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`text` text NOT NULL,
	`authored_by` text NOT NULL,
	`data_origin` text NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claim`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `human_override` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`final_status` text NOT NULL,
	`authored_by` text NOT NULL,
	`data_origin` text NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claim`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `human_override_claim_id_unique` ON `human_override` (`claim_id`);--> statement-breakpoint
CREATE TABLE `report` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`version` integer NOT NULL,
	`evidence_snapshot_hash` text NOT NULL,
	`data_origin` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `report_item` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`audience` text NOT NULL,
	`data_origin` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `report`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`claim_id`) REFERENCES `claim`(`id`) ON UPDATE no action ON DELETE no action
);
