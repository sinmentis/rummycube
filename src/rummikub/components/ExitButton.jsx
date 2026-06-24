import React from "react";
import {useLocation, useNavigate} from "react-router-dom";

export default function ExitButton() {
    const navigate = useNavigate();
    const {pathname} = useLocation();

    if (!pathname.startsWith("/match/")) return null;

    return (
        <button
            type="button"
            className="exit-button"
            onClick={() => navigate("/")}>
            Exit
        </button>
    );
}
