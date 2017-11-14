package shengji.gui.image;

import shengji.common.FrameCreator;
import shengji.gui.ImageLabel;

import javax.swing.*;

public class TestJLabel {

    public static void main(String[] args) {
        JFrame frame = FrameCreator.createFrame();
        ImageLabel image = new ImageLabel(frame);
        image.setImageDirectory("sample_01.jpg");
        image.setLocation(300, 200);
        frame.setVisible(true);
    }
}
