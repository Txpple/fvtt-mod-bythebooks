/**
 * By the Books — MACHINE (ARCHITECTURE.md §7): the saving throws. ONE machine on ONE `saves` flag,
 * a directory whose only public face is this file. The caster stamps the demand; each target rolls
 * on the client that owns it; the elect folds against the DC STORED AT CAST TIME and applies.
 * The parts' hooks run in dispatch.js's ORDER, not in this list's; cross-part calls are hoisted
 * functions, which is what makes the cycles safe.
 * ⚠ The buzzer ROLLS (a demanded save is mandatory). Legendary resistance arrives as a later
 * UPDATE, and the elect OVERTURNS the verdict. DEAD skips (dead status, NPC at 0 HP) are narrower
 * than hp<=0: a DYING PC is still demanded. A consumed item (a scroll's last use) strands its
 * effects: a late verdict applies damage only. Clock skew moves the buzzer, never the verdict.
 */

import "./demand.js";        // the stamp on the usage card, the dead-target gate, the emanation reach
import "./areas.js";         // template adoption, the bare-template claim, the spent-area sweep
import "./verdict.js";       // the fold against the stored DC, the die-less folds, the legendary-resistance flip
import "./ask.js";           // the system dialog with the demand fieldset, the straight roll, the buzzer
import "./consequences.js";  // effects per outcome, the status press, damage reconcile
import "./choices.js";       // Interpose and the bash, on the same `saves` flag
import "./views.js";         // the card row and the create / update / delete watchers

export { areaOccupants } from "./areas.js";
