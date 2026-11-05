-- PostgreSQL Production Schema for Parliamentary Event & Protocol Management Platform
-- Conforms to Section 7.3 of the Specification

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 7.3.1 Organizations and users
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    email VARCHAR(320) NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    password_hash TEXT,
    auth_provider VARCHAR(40) NOT NULL DEFAULT 'local',
    external_subject VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'invited'
        CHECK (status IN ('invited', 'active', 'suspended', 'deactivated')),
    mfa_required BOOLEAN NOT NULL DEFAULT false,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, email)
);

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    key VARCHAR(80) NOT NULL,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    is_system_role BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, key)
);

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(120) NOT NULL UNIQUE,
    description TEXT NOT NULL
);

CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    event_code VARCHAR(80) NOT NULL,
    name VARCHAR(250) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'setup', 'active', 'completed', 'archived')),
    venue_name VARCHAR(250),
    venue_address TEXT,
    timezone VARCHAR(80) NOT NULL,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    rsvp_deadline TIMESTAMPTZ,
    brand_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    attendance_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES users(id),
    activated_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, event_code),
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE user_role_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    role_id UUID NOT NULL REFERENCES roles(id),
    event_id UUID REFERENCES events(id),
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
);

CREATE TABLE event_user_access (
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES users(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    PRIMARY KEY (event_id, user_id)
);

-- 7.3.3 Institutions and people
CREATE TABLE institutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(250) NOT NULL,
    institution_type VARCHAR(100),
    official_domain VARCHAR(255),
    contact_email VARCHAR(320),
    contact_phone VARCHAR(40),
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, name)
);

CREATE TABLE institution_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    alias VARCHAR(250) NOT NULL,
    UNIQUE (institution_id, alias)
);

CREATE TABLE people (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    institution_id UUID REFERENCES institutions(id),
    title VARCHAR(80),
    first_name VARCHAR(120),
    middle_name VARCHAR(120),
    last_name VARCHAR(120),
    full_name VARCHAR(250) NOT NULL,
    preferred_display_name VARCHAR(250),
    designation VARCHAR(250),
    email VARCHAR(320),
    phone VARCHAR(40),
    record_status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (record_status IN ('active', 'archived', 'merged')),
    merged_into_person_id UUID REFERENCES people(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);

CREATE INDEX idx_people_org_name ON people (organization_id, lower(full_name));
CREATE INDEX idx_people_org_email ON people (organization_id, lower(email)) WHERE email IS NOT NULL;

-- 7.3.4 Protocol categories and event guests
CREATE TABLE protocol_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    category_key VARCHAR(80) NOT NULL,
    name VARCHAR(180) NOT NULL,
    rank_order INTEGER NOT NULL CHECK (rank_order > 0),
    colour_hex CHAR(7) NOT NULL,
    description TEXT,
    eligibility_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, category_key),
    UNIQUE (event_id, rank_order)
);

CREATE TABLE guest_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(180) NOT NULL,
    group_type VARCHAR(80),
    institution_id UUID REFERENCES institutions(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, name)
);

CREATE TABLE event_guests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES people(id),
    institution_id UUID REFERENCES institutions(id),
    protocol_category_id UUID REFERENCES protocol_categories(id),
    guest_group_id UUID REFERENCES guest_groups(id),
    guest_reference VARCHAR(80),
    invitation_required BOOLEAN NOT NULL DEFAULT true,
    companion_allowance INTEGER NOT NULL DEFAULT 0 CHECK (companion_allowance >= 0),
    accessibility_requirements TEXT,
    operational_notes TEXT,
    guest_status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (guest_status IN ('active', 'withdrawn', 'cancelled', 'archived')),
    category_override_reason TEXT,
    category_updated_by UUID REFERENCES users(id),
    category_updated_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, person_id),
    UNIQUE (event_id, guest_reference)
);

CREATE TABLE guest_group_members (
    guest_group_id UUID NOT NULL REFERENCES guest_groups(id) ON DELETE CASCADE,
    event_guest_id UUID NOT NULL REFERENCES event_guests(id) ON DELETE CASCADE,
    membership_role VARCHAR(60),
    PRIMARY KEY (guest_group_id, event_guest_id)
);

-- 7.3.5 Import batches
CREATE TABLE import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id),
    uploaded_by UUID NOT NULL REFERENCES users(id),
    original_filename VARCHAR(255) NOT NULL,
    storage_key TEXT NOT NULL,
    file_sha256 CHAR(64),
    status VARCHAR(20) NOT NULL DEFAULT 'uploaded'
        CHECK (status IN ('uploaded', 'mapping', 'validated', 'importing', 'completed', 'completed_with_errors', 'failed', 'cancelled')),
    total_rows INTEGER NOT NULL DEFAULT 0,
    valid_rows INTEGER NOT NULL DEFAULT 0,
    warning_rows INTEGER NOT NULL DEFAULT 0,
    error_rows INTEGER NOT NULL DEFAULT 0,
    imported_rows INTEGER NOT NULL DEFAULT 0,
    mapping_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE import_row_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    source_data JSONB NOT NULL,
    normalized_data JSONB,
    outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('valid', 'warning', 'error', 'created', 'updated', 'skipped')),
    errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
    person_id UUID REFERENCES people(id),
    event_guest_id UUID REFERENCES event_guests(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (import_batch_id, row_number)
);

-- 7.3.6 Templates and versions
CREATE TABLE invitation_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(180) NOT NULL,
    channel VARCHAR(20) NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'pdf')),
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invitation_template_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES invitation_templates(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    subject_template VARCHAR(300),
    html_content TEXT,
    text_content TEXT,
    pdf_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    variable_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'retired')),
    created_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    approval_note TEXT,
    content_sha256 CHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (template_id, version_number)
);

-- 7.3.7 Campaigns and invitations
CREATE TABLE invitation_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id),
    template_version_id UUID NOT NULL REFERENCES invitation_template_versions(id),
    name VARCHAR(180) NOT NULL,
    campaign_type VARCHAR(30) NOT NULL DEFAULT 'initial' CHECK (campaign_type IN ('initial', 'reminder', 'correction', 'replacement')),
    status VARCHAR(25) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'validating', 'pending_approval', 'approved', 'scheduled', 'queued', 'sending', 'paused', 'completed', 'cancelled', 'rejected', 'failed')),
    sender_name VARCHAR(180) NOT NULL,
    sender_email VARCHAR(320) NOT NULL,
    reply_to_email VARCHAR(320),
    subject_snapshot VARCHAR(300) NOT NULL,
    audience_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
    audience_count INTEGER NOT NULL DEFAULT 0,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    approval_note TEXT,
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id),
    event_guest_id UUID NOT NULL REFERENCES event_guests(id),
    campaign_id UUID REFERENCES invitation_campaigns(id),
    template_version_id UUID NOT NULL REFERENCES invitation_template_versions(id),
    invitation_reference VARCHAR(80) NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    token_expires_at TIMESTAMPTZ,
    token_revoked_at TIMESTAMPTZ,
    recipient_email_snapshot VARCHAR(320) NOT NULL,
    recipient_name_snapshot VARCHAR(250) NOT NULL,
    designation_snapshot VARCHAR(250),
    institution_snapshot VARCHAR(250),
    category_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    invitation_status VARCHAR(20) NOT NULL DEFAULT 'prepared' CHECK (invitation_status IN ('prepared', 'queued', 'sent', 'failed', 'revoked', 'superseded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, invitation_reference),
    UNIQUE (event_id, event_guest_id, id)
);

-- 7.3.8 Email attempts and webhooks
CREATE TABLE email_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_id UUID NOT NULL REFERENCES invitations(id),
    campaign_id UUID REFERENCES invitation_campaigns(id),
    attempt_number INTEGER NOT NULL,
    provider VARCHAR(60) NOT NULL,
    provider_message_id VARCHAR(255),
    recipient_email VARCHAR(320) NOT NULL,
    status VARCHAR(25) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'submitted', 'delivered', 'bounced', 'rejected', 'failed', 'deferred')),
    error_code VARCHAR(120),
    error_message TEXT,
    submitted_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (invitation_id, attempt_number)
);

CREATE TABLE provider_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(60) NOT NULL,
    provider_event_id VARCHAR(255) NOT NULL,
    provider_message_id VARCHAR(255),
    event_type VARCHAR(100) NOT NULL,
    occurred_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    signature_valid BOOLEAN NOT NULL,
    processing_status VARCHAR(20) NOT NULL DEFAULT 'received' CHECK (processing_status IN ('received', 'processed', 'ignored', 'failed')),
    payload JSONB NOT NULL,
    processing_error TEXT,
    UNIQUE (provider, provider_event_id)
);

CREATE TABLE invitation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_id UUID NOT NULL REFERENCES invitations(id),
    email_attempt_id UUID REFERENCES email_attempts(id),
    event_type VARCHAR(40) NOT NULL CHECK (event_type IN ('queued', 'submitted', 'delivered', 'bounced', 'failed', 'open_signal', 'link_access', 'token_revoked', 'resent')),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    source VARCHAR(40),
    user_agent TEXT,
    ip_hash CHAR(64),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    provider_webhook_event_id UUID REFERENCES provider_webhook_events(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7.3.9 RSVP and companions
CREATE TABLE rsvps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_id UUID NOT NULL REFERENCES invitations(id),
    response VARCHAR(20) NOT NULL CHECK (response IN ('accepted', 'declined', 'pending_clarification')),
    companion_count INTEGER NOT NULL DEFAULT 0 CHECK (companion_count >= 0),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_via VARCHAR(30) NOT NULL DEFAULT 'invitation_page',
    confirmation_reference VARCHAR(80) NOT NULL UNIQUE,
    notes TEXT,
    supersedes_rsvp_id UUID REFERENCES rsvps(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE companions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rsvp_id UUID NOT NULL REFERENCES rsvps(id) ON DELETE CASCADE,
    display_name VARCHAR(250),
    title VARCHAR(80),
    accessibility_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7.3.10 Seating
CREATE TABLE seating_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id),
    version_number INTEGER NOT NULL,
    name VARCHAR(180) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'proposed', 'pending_approval', 'approved', 'superseded')),
    layout_storage_key TEXT,
    rules_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, version_number)
);

CREATE TABLE seating_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seating_plan_id UUID NOT NULL REFERENCES seating_plans(id) ON DELETE CASCADE,
    section_code VARCHAR(60) NOT NULL,
    name VARCHAR(180) NOT NULL,
    protocol_category_id UUID REFERENCES protocol_categories(id),
    capacity INTEGER NOT NULL CHECK (capacity >= 0),
    display_order INTEGER NOT NULL DEFAULT 0,
    colour_hex CHAR(7),
    section_type VARCHAR(30) NOT NULL DEFAULT 'general',
    is_active BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (seating_plan_id, section_code)
);

CREATE TABLE seats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES seating_sections(id) ON DELETE CASCADE,
    seat_code VARCHAR(80) NOT NULL,
    row_label VARCHAR(40),
    seat_number INTEGER,
    seat_status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (seat_status IN ('available', 'blocked', 'reserved', 'inactive')),
    accessibility_designation VARCHAR(80),
    coordinates JSONB,
    UNIQUE (section_id, seat_code)
);

CREATE TABLE seat_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seating_plan_id UUID NOT NULL REFERENCES seating_plans(id),
    event_guest_id UUID NOT NULL REFERENCES event_guests(id),
    seat_id UUID REFERENCES seats(id),
    section_id UUID NOT NULL REFERENCES seating_sections(id),
    assignment_type VARCHAR(20) NOT NULL DEFAULT 'principal' CHECK (assignment_type IN ('principal', 'companion', 'group_block')),
    status VARCHAR(20) NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'released', 'cancelled')),
    assigned_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_active_seat_assignment ON seat_assignments (seating_plan_id, seat_id) WHERE seat_id IS NOT NULL AND status IN ('proposed', 'approved');
CREATE UNIQUE INDEX uq_active_guest_assignment ON seat_assignments (seating_plan_id, event_guest_id) WHERE assignment_type = 'principal' AND status IN ('proposed', 'approved');

-- 7.3.11 QR credentials and attendance
CREATE TABLE qr_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id),
    invitation_id UUID NOT NULL REFERENCES invitations(id),
    credential_hash CHAR(64) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id),
    event_guest_id UUID NOT NULL REFERENCES event_guests(id),
    qr_credential_id UUID REFERENCES qr_credentials(id),
    checkin_status VARCHAR(20) NOT NULL DEFAULT 'checked_in' CHECK (checkin_status IN ('checked_in', 'reversed', 'exception')),
    checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    checked_in_by UUID REFERENCES users(id),
    checkin_method VARCHAR(20) NOT NULL CHECK (checkin_method IN ('qr', 'manual', 'offline_sync', 'supervisor_override')),
    override_reason TEXT,
    device_reference VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_one_active_checkin_per_guest ON attendance_records (event_id, event_guest_id) WHERE checkin_status = 'checked_in';

-- 7.3.12 Audit logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    event_id UUID REFERENCES events(id),
    actor_user_id UUID REFERENCES users(id),
    actor_type VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'system', 'ai', 'integration')),
    action VARCHAR(120) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID,
    outcome VARCHAR(20) NOT NULL DEFAULT 'success' CHECK (outcome IN ('success', 'denied', 'failed')),
    reason TEXT,
    before_data JSONB,
    after_data JSONB,
    correlation_id UUID,
    ip_hash CHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7.3.13 AI sessions and tools
CREATE TABLE ai_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    event_id UUID REFERENCES events(id),
    user_id UUID NOT NULL REFERENCES users(id),
    title VARCHAR(200),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    provider VARCHAR(60) NOT NULL,
    model VARCHAR(120) NOT NULL,
    interaction_type VARCHAR(30) NOT NULL CHECK (interaction_type IN ('question', 'generation', 'tool_plan', 'tool_result')),
    prompt_redacted TEXT,
    response_redacted TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    estimated_cost NUMERIC(12,6),
    latency_ms INTEGER,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_tool_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interaction_id UUID NOT NULL REFERENCES ai_interactions(id),
    tool_name VARCHAR(120) NOT NULL,
    permission_key VARCHAR(120) NOT NULL,
    input_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    output_summary JSONB,
    status VARCHAR(25) NOT NULL CHECK (status IN ('proposed', 'awaiting_approval', 'approved', 'executing', 'completed', 'denied', 'failed', 'cancelled')),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    error_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7.3.14 Notifications, tasks, outbox
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    event_id UUID REFERENCES events(id),
    notification_type VARCHAR(100) NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    target_type VARCHAR(80),
    target_id UUID,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id),
    title VARCHAR(220) NOT NULL,
    description TEXT,
    assigned_to UUID REFERENCES users(id),
    created_by UUID REFERENCES users(id),
    priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'blocked', 'completed', 'cancelled')),
    due_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(120) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'published', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ
);

