package shengji.common;

import javax.swing.*;

public class FrameCreator {

    public static JFrame createFrame() {
        JFrame frame = new JFrame();
        frame.setSize(800, 600);
        frame.setLayout(null);
        frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        return frame;
    }

}
