package shengji.gui.image;

import shengji.common.FrameCreator;
import shengji.gui.CardContainer;
import shengji.gui.CardImage;

import javax.swing.*;
import java.awt.*;

import static shengji.common.Constants.*;

public class TestMultipleCardContainer {

    public static void main(String[] args) {
        JFrame frame = FrameCreator.createFrame();

        CardContainer south = CardContainerFill(frame);
        south.setBaseLocation(CARD_CONTAINER_BASE_X_SOUTH, CARD_CONTAINER_BASE_Y_SOUTH);
        south.display();

        CardContainer north = CardContainerFill(frame);
        north.setBaseLocation(CARD_CONTAINER_BASE_X_NORTH, CARD_CONTAINER_BASE_Y_NORTH);
        north.display();

        CardContainer west = CardContainerFill(frame);
        west.setBaseLocation(CARD_CONTAINER_BASE_X_WEST, CARD_CONTAINER_BASE_Y_WEST);
        west.setDirection(CardContainer.VERTICAL);
        west.display();

        CardContainer east = CardContainerFill(frame);
        east.setBaseLocation(CARD_CONTAINER_BASE_X_EAST, CARD_CONTAINER_BASE_Y_EAST);
        east.setDirection(CardContainer.VERTICAL);
        east.display();

        frame.setVisible(true);
    }


    private static CardContainer CardContainerFill(JFrame frame) {
        CardContainer cc = new CardContainer(frame);
        for (int i = 0; i < 25; i++) {
            CardImage card = new CardImage(frame, "cards/big_joker.png");
            cc.addCard(card);
        }
        return cc;
    }
}
