package shengji.gui.image;

import shengji.common.FrameCreator;
import shengji.gui.CardImage;

import javax.swing.*;

public class TestCardImage {

    public static void main(String[] args) {
        JFrame frame = FrameCreator.createFrame();
        CardImage cardImage = new CardImage(frame, "sample_01.jpg");
        cardImage.setLocation(200, 300);
        frame.setVisible(true);
    }
}
