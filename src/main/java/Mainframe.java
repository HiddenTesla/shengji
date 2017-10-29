import gui.ImageContainer;
import org.testng.annotations.Test;

import javax.swing.*;
import java.awt.*;


/**
 *
 */

public class Mainframe extends logger.LoggerBase {

    // region member variables

    // endregion
    public static void main(String[] args) {

        JFrame frame = new JFrame();

        // Size may be adjusted at any time
        frame.setSize(600, 300);

        // Centralize the frame
        frame.setLocationRelativeTo(null);

        gui.ImageContainer card = new ImageContainer("sample.jpg");

        frame.add(card);

        frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        frame.setVisible(true);
    }

    @Test
    public void LogSomething() throws Exception {
        log.debug("Debug");
        log.info("Info");
        log.warn("Warning");
        log.error("Error");
        log.fatal("Fatal");
    }


    @Test
    public void NewFrame() throws Exception {
        JFrame frame = new JFrame("Shengji");

        frame.setVisible(true);
    }
}
