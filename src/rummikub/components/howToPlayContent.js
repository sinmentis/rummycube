// Static rules copy for the How-to-play modal. Kept as a plain data module
// (no CSS/JSX) so it can be unit-tested directly, like quickChat.js.

export const HOW_TO_PLAY_TITLE = "How to play";

export const HOW_TO_PLAY_RULES = [
    {
        term: "Goal",
        text: "Be the first to empty your rack of tiles.",
    },
    {
        term: "Your turn",
        text: "Each turn you either draw one tile or meld tiles onto the table.",
    },
    {
        term: "Run",
        text: "A run is 3 or more consecutive numbers in a single color, e.g. 4-5-6 red.",
    },
    {
        term: "Set",
        text: "A set is the same number in different colors, e.g. 7 red, 7 blue, 7 black.",
    },
    {
        term: "First meld",
        text: "Your first meld must total at least 30 points, using only tiles from your own rack.",
    },
    {
        term: "Jokers",
        text: "Jokers are wild and can stand in for any tile in a run or set.",
    },
    {
        term: "Turn timer",
        text: "Watch the timer ring: when it runs out your turn auto-ends.",
    },
];
