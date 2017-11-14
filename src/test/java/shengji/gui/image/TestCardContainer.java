package shengji.gui.image;

import shengji.common.FrameCreator;
import shengji.gui.CardContainer;
import shengji.gui.CardImage;

import javax.swing.*;

public class TestCardContainer {

    public static void main(String[] args) {
        JFrame frame = FrameCreator.createFrame();
        CardContainer cc = new CardContainer(frame);

        for (int i = 0; i < 3; i++) {
            cc.addCard(new CardImage(frame,"sample_01.jpg"));
        }

        cc.display();

        cc.setBaseLocation(200, 150);
        cc.addCard(new CardImage(frame,"sample_01.jpg"));
        cc.display();
    }

}
