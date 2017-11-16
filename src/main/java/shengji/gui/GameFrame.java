package shengji.gui;

import javax.swing.*;
import shengji.common.Constants.*;

import static shengji.common.Constants.GAME_FRAME_HEIGHT;
import static shengji.common.Constants.GAME_FRAME_WIDTH;

public class GameFrame extends JFrame {

    protected CardContainer south = new CardContainer(this);

    public GameFrame() {
        this.setLayout(null);
        this.setSize(GAME_FRAME_WIDTH, GAME_FRAME_HEIGHT);
        this.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
    }
}
