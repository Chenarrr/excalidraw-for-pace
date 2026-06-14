import React from "react";

import MainMenu from "./main-menu/MainMenu";

export function PaceMainMenu() {
  return (
    <MainMenu>
      <MainMenu.DefaultItems.SearchMenu />
      <MainMenu.Separator />
      <MainMenu.DefaultItems.ChangeCanvasBackground />
    </MainMenu>
  );
}
