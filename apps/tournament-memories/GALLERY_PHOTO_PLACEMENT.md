# Texas SCTP On the Range | Regular Gallery Photo Placement

Implemented November 9, 2026.

## Why it was missing

Regular gallery cards used `aspect-ratio: 1.5` and `object-fit: cover` without a crop controller for individual approved photos. Historical `memory_hero_placements.card` data was only available for slideshow-selected photos. Ordinary gallery images therefore defaulted to a centered crop, cutting off subjects in some photographs.

## Moderator instructions

Use the existing Texas SCTP On the Range website, signed in through **Staff Access** as an authorized moderator.

**Option A: Moderation**

1. Open **Moderation**.
2. Select **Gallery Photo Placement** next to the other moderation tabs.
3. Choose an approved photo. Each photograph appears separately even within a multi-photo submission.
4. Click **Adjust placement**.
5. Select **Fill the frame** (move the focus using Left/Right and Top/Bottom sliders) or **Show entire photo** (display without cropping).
6. Optionally use the **Top / faces**, **Center**, or **Bottom** presets and the zoom slider.
7. Check the live 3:2 gallery-card preview. Expand **Compare with the full original photograph** if needed.
8. Click **Save photo placement**.

**Option B: Gallery**

1. From the regular photo gallery, moderators see **Adjust photo** on each approved gallery card.
2. Click it to open the same editor, or open the photo to select the second/third/etc. image and use **Adjust gallery photo placement** there.
3. Save and return to the gallery.

## Data and permissions

- `public.memory_photos` stores optional `card_crop_x`, `card_crop_y`, `card_crop_zoom`, and `card_crop_fit` for each photograph, plus the moderator and timestamp.
- No changes are made to the source image in Supabase Storage; this is a display-only setting.
- Existing slideshow placements remain intact. Legacy slideshow card cropping is the fallback when no photo-specific framing has been saved.
- The authenticated RPC `public.memory_staff_set_photo_card_crop` delegates to `memories_private.set_photo_card_crop` with explicit sign-in, authorized team-moderator, and published-post checks. Anonymous callers cannot access it.
- Crop values are restricted by database constraints: X/Y 0–100%; zoom 1–1.45; fit `cover` or `contain`.
- Image metadata is visible to public readers under existing photo gallery RLS. Photo modifications are not possible through direct public or staff table writes.
- The default remains the gallery's existing centered crop until a moderator saves an individual adjustment.

## Operational note

A 3:2 preview simulates the normal gallery feed. **Show entire photo** preserves the complete photo, with neutral margins for images that do not match the frame. The original remains unchanged. This operation neither posts to Facebook nor changes social-media authorization.

Status: code, database schema, and permission checks implemented; verify Render deployment before confirming the UI is visible.
