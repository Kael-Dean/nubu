# Jungkook v3: per-gesture arm spec (built from ARM-HAND-REFERENCE.md)

Rule 0: judge forearm rotation from the elbow, not from the camera. Never reuse a forearm from another rotation family.
Build rule: each gesture gets WHOLE-ARM drawings (upper arm + elbow + forearm + hand + tattoo painted on the pose),
generated from the master in one image so the style, tattoo and lighting match, then cut and swapped in on the clav bone.
The A-pose rest arms stay as they are (supinated, palms forward), and they're the only arms that bend by mesh.

| Gesture | Arm(s) swapped | Chain: shoulder → elbow → forearm → hand (what the viewer sees) |
|---|---|---|
| A-pose (rest) | none | arms ~25° out; elbow crook faces camera; forearm SUPINATED (wide, flat front); palm forward, thumb out |
| natural stance | both (mirror) | arms hang close to the body; elbow points back, small bend; forearm NEUTRAL (narrower, wrist edge-on); thumb forward, hand side-on against the thigh; fingertips at mid-thigh; L and R identical length/width (tattoo is the only difference) |
| wave (R) | R | upper arm out ~60° (inner arm visible: biceps on top); elbow points DOWN-OUT with a drawn corner; forearm NEUTRAL, vertical; PALM to camera, thumb toward head, hand beside head |
| peace (R) | R | elbow DOWN by the ribs, upper arm short/foreshortened (biceps front); forearm PRONATED pointing up (back of forearm + elbow point at the bottom, palm side at wrist); V sign with PALM OUT at shoulder height |
| point up (R) | R | elbow down-out; forearm neutral, raised; palm 3/4 to camera, thumb toward head; index finger up beside the head |
| thumbs up (R) | R | upper arm rolled in (outer arm, deltoid/triceps side); elbow down-out; forearm NEUTRAL across/up in front of the chest; fist with knuckles forward, thumb up |
| flex (both) | R + L | upper arm about horizontal, slightly above shoulder; elbow down-out with an olecranon corner; forearm SUPINATED vertical, flesh pressing into the biceps (no gap); fist curled toward the head, palm toward the face |
| finger heart (L) | L | upper arm front; elbow down-out; forearm neutral, short, diagonal up-in; hand at chest, back of hand 3/4, thumb crossed over index |
| hold mic (R) | R | elbow down, slightly forward; forearm neutral, up; fist around the mic below the chin, knuckles 3/4, thumb on top; the mic head touches below the lips |

Review per frame (ARM-HAND-REFERENCE §5): the elbow is a corner, not a straight line; forearm meets upper arm with no gap;
forearm root ≥ elbow width; thumb on the side the spec says; both arms' lengths match in the natural stance (flip-overlay check).
