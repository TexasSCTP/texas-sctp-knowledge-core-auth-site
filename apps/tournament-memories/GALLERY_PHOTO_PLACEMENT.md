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


## Interactive drag positioning and separate hero banner previews

Updated November 9, 2026.

From **Moderation → Gallery Photo Placement → Adjust Placement**, or **Adjust Photo** on an existing gallery card, the authorized moderator now sees three distinct views:

- **Gallery photo** (3:2). Drag the photo in the preview with a mouse or finger, use keyboard arrows or sliders to adjust the position, then select **Save gallery placement**. Select *Show entire photo* when needed. Starting a drag while that mode is active switches to *Fill the frame*, since an uncropped image has no off-frame region to reposition.
- **Hero banner · Desktop** (1680:430 widescreen). Drag and adjust the crop specifically for the desktop homepage hero, then select **Save desktop hero**.
- **Hero banner · Mobile** (390:548 mobile reference). Drag and adjust the separate phone hero crop, then select **Save mobile hero**.

The three views use independent backend fields. Editing one never silently changes the other two. In particular, the card crop remains in `memory_photos`, and hero desktop/mobile positioning remains in `memory_hero_placements`.

The same photo can also be opened directly with **⋯ → Adjust hero banner** from its gallery card. Hero preview includes a simplified homepage heading and scrim to help staff check subject visibility against hero text.

Photo repositioning is **display-only**. The original uploaded image and any rights/consent records are unchanged.

Authorized staff saves use server-validated RPCs `memory_staff_set_photo_card_crop` and `memory_staff_set_hero_photo_crop` scoped to authorized teams. Hero placement does not implicitly re-enable a photo manually hidden from the slideshow.

The older **Slideshow Studio** supports dragging as well. Its old direct table-upsert was replaced with the authorized RPC `memory_staff_save_hero_photo_placement`, which preserves enabled state and saves all desktop/mobile/card preview settings.

No CAPTCHA was added. Live Meta publishing remains separate and disabled.


## Optional per-photo slideshow inclusion switch (November 9, 2026)

Each gallery-approved photograph now has a **Show this photo in the homepage hero slideshow** on/off switch in the authenticated photo positioning dialog. The switch appears below the Gallery / Hero Desktop / Hero Mobile tabs, and applies to the hero rotation on **both** desktop and mobile. It does not hide or remove the photo from the normal tournament gallery, delete the original image, alter cropping settings, or affect separate Facebook/Instagram publication approvals.

- **ON**: This individual photo is eligible for the homepage slideshow.
- **OFF**: This individual photo is excluded from the homepage slideshow but stays in the normal gallery. Turning the switch on again restores eligibility.
- The switch is persisted immediately via the team-authorized `memory_staff_set_hero_photo_visibility` RPC with an audit timestamp and moderator ID. Public and unauthorized callers cannot modify it.
- The homepage's `memory_hero_candidates` query excludes disabled records. Approved gallery photos may still be automatically enrolled by the database, but an existing manual OFF setting is **never overwritten** by future approval processing.
- A matching switch is visible next to each item in **Slideshow Studio**. For approved live photos, changes save immediately and restore the previous state if saving fails. The seven illustrative/sample scenes remain file-backed and require **Publish settings** and a staging Render deployment for their changes.
- This switch manages individual image/slide visibility, **not** removal of a logo already embedded within the pixels of a photograph.
